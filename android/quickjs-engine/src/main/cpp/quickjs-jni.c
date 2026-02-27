#include <jni.h>
#include <android/log.h>
#include <string.h>
#include <stdlib.h>
#include "quickjs.h"

#define LOG_TAG "QuickJS-JNI"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// -----------------------------------------------------------------------------
// ArrayBuffer helpers
// -----------------------------------------------------------------------------

/**
 * Convert Java ByteArray to JS ArrayBuffer.
 * Returns JS_UNDEFINED if data is NULL.
 */
static JSValue byte_array_to_array_buffer(JSContext *ctx, JNIEnv *env, jbyteArray data) {
    if (!data) {
        return JS_UNDEFINED;
    }
    jsize len = (*env)->GetArrayLength(env, data);
    jbyte *bytes = (*env)->GetByteArrayElements(env, data, NULL);

    JSValue arrayBuffer = JS_NewArrayBufferCopy(ctx, (uint8_t *)bytes, len);

    (*env)->ReleaseByteArrayElements(env, data, bytes, JNI_ABORT);
    return arrayBuffer;
}

/**
 * Convert JS ArrayBuffer to Java ByteArray.
 * Returns NULL if val is not an ArrayBuffer.
 */
static jbyteArray array_buffer_to_byte_array(JSContext *ctx, JNIEnv *env, JSValue val) {
    size_t len;
    uint8_t *buf = JS_GetArrayBuffer(ctx, &len, val);

    if (!buf) {
        // Try getting from typed array (e.g., Uint8Array)
        size_t offset, elem_size;
        JSValue abuf = JS_GetTypedArrayBuffer(ctx, val, &offset, &len, &elem_size);
        if (!JS_IsException(abuf)) {
            buf = JS_GetArrayBuffer(ctx, &len, abuf);
            JS_FreeValue(ctx, abuf);
            if (buf) {
                buf += offset;
            }
        }
    }

    if (!buf) {
        return NULL;
    }

    jbyteArray result = (*env)->NewByteArray(env, (jsize)len);
    if (!result) return NULL;  // OOM
    (*env)->SetByteArrayRegion(env, result, 0, (jsize)len, (jbyte *)buf);
    return result;
}

// -----------------------------------------------------------------------------
// Callback class for storing Kotlin callbacks
// -----------------------------------------------------------------------------
static JSClassID js_callback_class_id = 0;

typedef struct {
    JavaVM *jvm;
    jobject callback;      // Global ref to Kotlin callback
    jmethodID invokeMethod;
} JsCallbackData;

static void js_callback_finalizer(JSRuntime *rt, JSValue val) {
    (void)rt;
    JsCallbackData *data = (JsCallbackData *)JS_GetOpaque(val, js_callback_class_id);
    if (data) {
        // Get JNIEnv to release global ref
        JNIEnv *env = NULL;
        jint status = (*data->jvm)->GetEnv(data->jvm, (void **)&env, JNI_VERSION_1_6);
        if (status == JNI_OK && env) {
            (*env)->DeleteGlobalRef(env, data->callback);
        }
        free(data);
        LOGD("Callback data finalized");
    }
}

static JSClassDef js_callback_class = {
    "JsCallbackData",
    .finalizer = js_callback_finalizer,
};

// -----------------------------------------------------------------------------
// Helper: Convert JS value to Java object
// -----------------------------------------------------------------------------
static jobject js_value_to_jobject(JNIEnv *env, JSContext *ctx, JSValue val) {
    if (JS_IsNull(val) || JS_IsUndefined(val)) {
        return NULL;
    }

    if (JS_IsBool(val)) {
        jclass cls = (*env)->FindClass(env, "java/lang/Boolean");
        jmethodID mid = (*env)->GetStaticMethodID(env, cls, "valueOf", "(Z)Ljava/lang/Boolean;");
        return (*env)->CallStaticObjectMethod(env, cls, mid, JS_ToBool(ctx, val) ? JNI_TRUE : JNI_FALSE);
    }

    if (JS_IsNumber(val)) {
        double d;
        JS_ToFloat64(ctx, &d, val);

        // Check if it's an integer that fits in int32
        if (d == (int64_t)d && d >= -2147483648.0 && d <= 2147483647.0) {
            jclass cls = (*env)->FindClass(env, "java/lang/Integer");
            jmethodID mid = (*env)->GetStaticMethodID(env, cls, "valueOf", "(I)Ljava/lang/Integer;");
            return (*env)->CallStaticObjectMethod(env, cls, mid, (jint)d);
        } else {
            jclass cls = (*env)->FindClass(env, "java/lang/Double");
            jmethodID mid = (*env)->GetStaticMethodID(env, cls, "valueOf", "(D)Ljava/lang/Double;");
            return (*env)->CallStaticObjectMethod(env, cls, mid, d);
        }
    }

    if (JS_IsString(val)) {
        const char *str = JS_ToCString(ctx, val);
        jstring jstr = (*env)->NewStringUTF(env, str);
        JS_FreeCString(ctx, str);
        return jstr;
    }

    // For objects/arrays, return string representation for now
    // Can be extended to return JSObject wrapper
    const char *str = JS_ToCString(ctx, val);
    if (str) {
        jstring jstr = (*env)->NewStringUTF(env, str);
        JS_FreeCString(ctx, str);
        return jstr;
    }

    return NULL;
}

// -----------------------------------------------------------------------------
// Helper: Throw Java exception from JS exception
// -----------------------------------------------------------------------------
static void throw_js_exception(JNIEnv *env, JSContext *ctx) {
    JSValue exception = JS_GetException(ctx);
    const char *msg = JS_ToCString(ctx, exception);

    jclass cls = (*env)->FindClass(env, "com/jstorrent/quickjs/QuickJsException");
    (*env)->ThrowNew(env, cls, msg ? msg : "Unknown JavaScript error");

    if (msg) JS_FreeCString(ctx, msg);
    JS_FreeValue(ctx, exception);
}

// -----------------------------------------------------------------------------
// JNI: Create runtime and context
// Returns: long (pointer to JSContext)
// -----------------------------------------------------------------------------
JNIEXPORT jlong JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeCreate(JNIEnv *env, jclass clazz) {
    (void)clazz;

    JSRuntime *rt = JS_NewRuntime();
    if (!rt) {
        jclass cls = (*env)->FindClass(env, "com/jstorrent/quickjs/QuickJsException");
        (*env)->ThrowNew(env, cls, "Failed to create QuickJS runtime");
        return 0;
    }

    // Register our callback class if not yet registered
    if (js_callback_class_id == 0) {
        JS_NewClassID(rt, &js_callback_class_id);
    }
    JS_NewClass(rt, js_callback_class_id, &js_callback_class);

    JSContext *ctx = JS_NewContext(rt);
    if (!ctx) {
        JS_FreeRuntime(rt);
        jclass cls = (*env)->FindClass(env, "com/jstorrent/quickjs/QuickJsException");
        (*env)->ThrowNew(env, cls, "Failed to create QuickJS context");
        return 0;
    }

    LOGD("QuickJS context created: %p", ctx);
    return (jlong)(intptr_t)ctx;
}

// -----------------------------------------------------------------------------
// JNI: Destroy runtime and context
// -----------------------------------------------------------------------------
JNIEXPORT void JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeDestroy(JNIEnv *env, jclass clazz, jlong ctxPtr) {
    (void)env;
    (void)clazz;

    JSContext *ctx = (JSContext *)(intptr_t)ctxPtr;
    if (ctx) {
        JSRuntime *rt = JS_GetRuntime(ctx);
        JS_FreeContext(ctx);
        JS_FreeRuntime(rt);
        LOGD("QuickJS context destroyed: %p", ctx);
    }
}

// -----------------------------------------------------------------------------
// JNI: Evaluate JavaScript code
// Returns: Object (boxed primitive, String, or null)
// -----------------------------------------------------------------------------
JNIEXPORT jobject JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeEvaluate(
    JNIEnv *env,
    jclass clazz,
    jlong ctxPtr,
    jstring script,
    jstring filename
) {
    (void)clazz;

    JSContext *ctx = (JSContext *)(intptr_t)ctxPtr;

    const char *scriptStr = (*env)->GetStringUTFChars(env, script, NULL);
    const char *filenameStr = (*env)->GetStringUTFChars(env, filename, NULL);

    JSValue result = JS_Eval(ctx, scriptStr, strlen(scriptStr), filenameStr, JS_EVAL_TYPE_GLOBAL);

    (*env)->ReleaseStringUTFChars(env, script, scriptStr);
    (*env)->ReleaseStringUTFChars(env, filename, filenameStr);

    if (JS_IsException(result)) {
        throw_js_exception(env, ctx);
        return NULL;
    }

    jobject jresult = js_value_to_jobject(env, ctx, result);
    JS_FreeValue(ctx, result);

    return jresult;
}

// -----------------------------------------------------------------------------
// JS function that calls back to Kotlin
// -----------------------------------------------------------------------------
static JSValue js_kotlin_callback(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv,
    int magic,
    JSValue *func_data
) {
    (void)this_val;
    (void)magic;

    JsCallbackData *data = (JsCallbackData *)JS_GetOpaque(*func_data, js_callback_class_id);
    if (!data) {
        return JS_ThrowInternalError(ctx, "Callback data not found");
    }

    JNIEnv *env;
    int attached = 0;

    // Get JNIEnv for current thread
    jint status = (*data->jvm)->GetEnv(data->jvm, (void **)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        (*data->jvm)->AttachCurrentThread(data->jvm, &env, NULL);
        attached = 1;
    }

    // Helper macro: check for pending JNI exception (e.g. OOM) and bail out
    // with a JS exception instead of letting ART abort the process.
    #define CHECK_JNI_EXCEPTION() do { \
        if ((*env)->ExceptionCheck(env)) { \
            (*env)->ExceptionClear(env); \
            if (attached) (*data->jvm)->DetachCurrentThread(data->jvm); \
            return JS_ThrowInternalError(ctx, "JNI exception (OOM?) in callback"); \
        } \
    } while (0)

    // Convert JS args to Java String array
    jclass stringClass = (*env)->FindClass(env, "java/lang/String");
    CHECK_JNI_EXCEPTION();
    jobjectArray jargs = (*env)->NewObjectArray(env, argc, stringClass, NULL);
    CHECK_JNI_EXCEPTION();

    for (int i = 0; i < argc; i++) {
        const char *str = JS_ToCString(ctx, argv[i]);
        if (str) {
            jstring jstr = (*env)->NewStringUTF(env, str);
            if ((*env)->ExceptionCheck(env)) {
                (*env)->ExceptionClear(env);
                JS_FreeCString(ctx, str);
                (*env)->DeleteLocalRef(env, jargs);
                if (attached) (*data->jvm)->DetachCurrentThread(data->jvm);
                return JS_ThrowInternalError(ctx, "JNI exception (OOM?) in callback");
            }
            (*env)->SetObjectArrayElement(env, jargs, i, jstr);
            (*env)->DeleteLocalRef(env, jstr);
            JS_FreeCString(ctx, str);
        }
    }

    // Call Kotlin callback: invoke(args: Array<String>): String?
    jstring jresult = (jstring)(*env)->CallObjectMethod(env, data->callback, data->invokeMethod, jargs);
    if ((*env)->ExceptionCheck(env)) {
        (*env)->ExceptionClear(env);
        (*env)->DeleteLocalRef(env, jargs);
        if (attached) (*data->jvm)->DetachCurrentThread(data->jvm);
        return JS_ThrowInternalError(ctx, "Kotlin callback threw exception");
    }

    (*env)->DeleteLocalRef(env, jargs);

    JSValue result = JS_UNDEFINED;
    if (jresult) {
        const char *resultStr = (*env)->GetStringUTFChars(env, jresult, NULL);
        result = JS_NewString(ctx, resultStr);
        (*env)->ReleaseStringUTFChars(env, jresult, resultStr);
        (*env)->DeleteLocalRef(env, jresult);
    }

    if (attached) {
        (*data->jvm)->DetachCurrentThread(data->jvm);
    }

    #undef CHECK_JNI_EXCEPTION
    return result;
}

// -----------------------------------------------------------------------------
// JNI: Set a global function that calls back to Kotlin
// -----------------------------------------------------------------------------
JNIEXPORT void JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeSetGlobalFunction(
    JNIEnv *env,
    jclass clazz,
    jlong ctxPtr,
    jstring name,
    jobject callback
) {
    (void)clazz;

    JSContext *ctx = (JSContext *)(intptr_t)ctxPtr;

    // Get JavaVM reference
    JavaVM *jvm;
    (*env)->GetJavaVM(env, &jvm);

    // Create callback data
    JsCallbackData *data = malloc(sizeof(JsCallbackData));
    data->jvm = jvm;
    data->callback = (*env)->NewGlobalRef(env, callback);

    // Get invoke method
    jclass callbackClass = (*env)->GetObjectClass(env, callback);
    data->invokeMethod = (*env)->GetMethodID(env, callbackClass, "invoke", "([Ljava/lang/String;)Ljava/lang/String;");

    // Create opaque JSValue to hold callback data (with our registered class)
    JSValue funcData = JS_NewObjectClass(ctx, js_callback_class_id);
    JS_SetOpaque(funcData, data);

    // Create JS function with callback (this duplicates funcData internally)
    JSValue func = JS_NewCFunctionData(ctx, js_kotlin_callback, 0, 0, 1, &funcData);

    // Free our local reference to funcData (the function now owns it)
    JS_FreeValue(ctx, funcData);

    // Set on global object
    const char *nameStr = (*env)->GetStringUTFChars(env, name, NULL);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, nameStr, func);
    JS_FreeValue(ctx, global);

    LOGD("Registered global function: %s", nameStr);
    (*env)->ReleaseStringUTFChars(env, name, nameStr);
}

// -----------------------------------------------------------------------------
// JNI: Execute pending jobs (for promises)
// Returns: true if there are more jobs pending
// -----------------------------------------------------------------------------
JNIEXPORT jboolean JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeExecutePendingJob(JNIEnv *env, jclass clazz, jlong ctxPtr) {
    (void)env;
    (void)clazz;

    JSContext *ctx = (JSContext *)(intptr_t)ctxPtr;
    JSContext *ctx2;
    int ret = JS_ExecutePendingJob(JS_GetRuntime(ctx), &ctx2);
    return ret > 0 ? JNI_TRUE : JNI_FALSE;
}

// -----------------------------------------------------------------------------
// Binary callback class for storing Kotlin callbacks that receive ByteArray
// -----------------------------------------------------------------------------
static JSClassID js_binary_callback_class_id = 0;

typedef struct {
    JavaVM *jvm;
    jobject callback;           // Global ref to Kotlin callback
    jmethodID invokeMethod;
    int binaryArgIndex;         // Which argument is the ArrayBuffer (-1 = none)
    int returnsBinary;          // Whether the callback returns ByteArray
} JsBinaryCallbackData;

static void js_binary_callback_finalizer(JSRuntime *rt, JSValue val) {
    (void)rt;
    JsBinaryCallbackData *data = (JsBinaryCallbackData *)JS_GetOpaque(val, js_binary_callback_class_id);
    if (data) {
        JNIEnv *env = NULL;
        jint status = (*data->jvm)->GetEnv(data->jvm, (void **)&env, JNI_VERSION_1_6);
        if (status == JNI_OK && env) {
            (*env)->DeleteGlobalRef(env, data->callback);
        }
        free(data);
        LOGD("Binary callback data finalized");
    }
}

static JSClassDef js_binary_callback_class = {
    "JsBinaryCallbackData",
    .finalizer = js_binary_callback_finalizer,
};

// -----------------------------------------------------------------------------
// JS function that calls back to Kotlin with binary data support
// -----------------------------------------------------------------------------
static JSValue js_kotlin_binary_callback(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv,
    int magic,
    JSValue *func_data
) {
    (void)this_val;
    (void)magic;

    JsBinaryCallbackData *data = (JsBinaryCallbackData *)JS_GetOpaque(*func_data, js_binary_callback_class_id);
    if (!data) {
        return JS_ThrowInternalError(ctx, "Binary callback data not found");
    }

    JNIEnv *env;
    int attached = 0;

    jint status = (*data->jvm)->GetEnv(data->jvm, (void **)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        (*data->jvm)->AttachCurrentThread(data->jvm, &env, NULL);
        attached = 1;
    }

    // Helper macro: check for pending JNI exception (e.g. OOM) and bail out
    // with a JS exception instead of letting ART abort the process.
    #define CHECK_JNI_EXCEPTION() do { \
        if ((*env)->ExceptionCheck(env)) { \
            (*env)->ExceptionClear(env); \
            if (attached) (*data->jvm)->DetachCurrentThread(data->jvm); \
            return JS_ThrowInternalError(ctx, "JNI exception (OOM?) in binary callback"); \
        } \
    } while (0)

    // Build string args array (for non-binary args)
    jclass stringClass = (*env)->FindClass(env, "java/lang/String");
    CHECK_JNI_EXCEPTION();
    jobjectArray jargs = (*env)->NewObjectArray(env, argc, stringClass, NULL);
    CHECK_JNI_EXCEPTION();

    jbyteArray binaryArg = NULL;

    for (int i = 0; i < argc; i++) {
        if (i == data->binaryArgIndex) {
            // This arg is binary - convert to ByteArray
            binaryArg = array_buffer_to_byte_array(ctx, env, argv[i]);
            CHECK_JNI_EXCEPTION();
            // Put placeholder in string array
            (*env)->SetObjectArrayElement(env, jargs, i, NULL);
        } else {
            const char *str = JS_ToCString(ctx, argv[i]);
            if (str) {
                jstring jstr = (*env)->NewStringUTF(env, str);
                if ((*env)->ExceptionCheck(env)) {
                    (*env)->ExceptionClear(env);
                    JS_FreeCString(ctx, str);
                    if (binaryArg) (*env)->DeleteLocalRef(env, binaryArg);
                    (*env)->DeleteLocalRef(env, jargs);
                    if (attached) (*data->jvm)->DetachCurrentThread(data->jvm);
                    return JS_ThrowInternalError(ctx, "JNI exception (OOM?) in binary callback");
                }
                (*env)->SetObjectArrayElement(env, jargs, i, jstr);
                (*env)->DeleteLocalRef(env, jstr);
                JS_FreeCString(ctx, str);
            }
        }
    }

    JSValue result = JS_UNDEFINED;

    if (data->returnsBinary) {
        // Call: invoke(args: Array<String>, binary: ByteArray?): ByteArray?
        jbyteArray jresult = (jbyteArray)(*env)->CallObjectMethod(
            env, data->callback, data->invokeMethod, jargs, binaryArg);

        if ((*env)->ExceptionCheck(env)) {
            (*env)->ExceptionClear(env);
            if (binaryArg) (*env)->DeleteLocalRef(env, binaryArg);
            (*env)->DeleteLocalRef(env, jargs);
            if (attached) (*data->jvm)->DetachCurrentThread(data->jvm);
            return JS_ThrowInternalError(ctx, "Kotlin binary callback threw exception");
        }

        if (jresult) {
            result = byte_array_to_array_buffer(ctx, env, jresult);
            (*env)->DeleteLocalRef(env, jresult);
        }
    } else {
        // Call: invoke(args: Array<String>, binary: ByteArray?): String?
        jstring jresult = (jstring)(*env)->CallObjectMethod(
            env, data->callback, data->invokeMethod, jargs, binaryArg);

        if ((*env)->ExceptionCheck(env)) {
            (*env)->ExceptionClear(env);
            if (binaryArg) (*env)->DeleteLocalRef(env, binaryArg);
            (*env)->DeleteLocalRef(env, jargs);
            if (attached) (*data->jvm)->DetachCurrentThread(data->jvm);
            return JS_ThrowInternalError(ctx, "Kotlin binary callback threw exception");
        }

        if (jresult) {
            const char *resultStr = (*env)->GetStringUTFChars(env, jresult, NULL);
            result = JS_NewString(ctx, resultStr);
            (*env)->ReleaseStringUTFChars(env, jresult, resultStr);
            (*env)->DeleteLocalRef(env, jresult);
        }
    }

    if (binaryArg) (*env)->DeleteLocalRef(env, binaryArg);
    (*env)->DeleteLocalRef(env, jargs);

    if (attached) {
        (*data->jvm)->DetachCurrentThread(data->jvm);
    }

    #undef CHECK_JNI_EXCEPTION
    return result;
}

// -----------------------------------------------------------------------------
// JNI: Set a global function that handles binary data
// binaryArgIndex: which argument is ArrayBuffer (-1 = none)
// returnsBinary: if true, callback returns ByteArray; otherwise String
// -----------------------------------------------------------------------------
JNIEXPORT void JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeSetGlobalFunctionWithBinary(
    JNIEnv *env,
    jclass clazz,
    jlong ctxPtr,
    jstring name,
    jobject callback,
    jint binaryArgIndex,
    jboolean returnsBinary
) {
    (void)clazz;

    JSContext *ctx = (JSContext *)(intptr_t)ctxPtr;
    JSRuntime *rt = JS_GetRuntime(ctx);

    // Register binary callback class if not yet registered
    if (js_binary_callback_class_id == 0) {
        JS_NewClassID(rt, &js_binary_callback_class_id);
        JS_NewClass(rt, js_binary_callback_class_id, &js_binary_callback_class);
    }

    JavaVM *jvm;
    (*env)->GetJavaVM(env, &jvm);

    JsBinaryCallbackData *data = malloc(sizeof(JsBinaryCallbackData));
    data->jvm = jvm;
    data->callback = (*env)->NewGlobalRef(env, callback);
    data->binaryArgIndex = binaryArgIndex;
    data->returnsBinary = returnsBinary ? 1 : 0;

    jclass callbackClass = (*env)->GetObjectClass(env, callback);
    if (returnsBinary) {
        // invoke(Array<String>, ByteArray?): ByteArray?
        data->invokeMethod = (*env)->GetMethodID(env, callbackClass, "invoke",
            "([Ljava/lang/String;[B)[B");
    } else {
        // invoke(Array<String>, ByteArray?): String?
        data->invokeMethod = (*env)->GetMethodID(env, callbackClass, "invoke",
            "([Ljava/lang/String;[B)Ljava/lang/String;");
    }

    JSValue funcData = JS_NewObjectClass(ctx, js_binary_callback_class_id);
    JS_SetOpaque(funcData, data);

    JSValue func = JS_NewCFunctionData(ctx, js_kotlin_binary_callback, 0, 0, 1, &funcData);
    JS_FreeValue(ctx, funcData);

    const char *nameStr = (*env)->GetStringUTFChars(env, name, NULL);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, nameStr, func);
    JS_FreeValue(ctx, global);

    LOGD("Registered binary global function: %s (binaryArg=%d, returnsBinary=%d)",
         nameStr, binaryArgIndex, returnsBinary);
    (*env)->ReleaseStringUTFChars(env, name, nameStr);
}

// -----------------------------------------------------------------------------
// JNI: Call a global JS function from Kotlin
// Returns the result as a Java object (String, Boolean, Integer, Double, ByteArray, or null)
// -----------------------------------------------------------------------------
JNIEXPORT jobject JNICALL
Java_app_ok200_quickjs_QuickJsContext_nativeCallGlobalFunction(
    JNIEnv *env,
    jclass clazz,
    jlong ctxPtr,
    jstring funcName,
    jobjectArray args,
    jbyteArray binaryArg,
    jint binaryArgIndex
) {
    (void)clazz;

    JSContext *ctx = (JSContext *)(intptr_t)ctxPtr;

    // Get the global function
    const char *funcNameStr = (*env)->GetStringUTFChars(env, funcName, NULL);
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue func = JS_GetPropertyStr(ctx, global, funcNameStr);
    (*env)->ReleaseStringUTFChars(env, funcName, funcNameStr);

    if (!JS_IsFunction(ctx, func)) {
        JS_FreeValue(ctx, func);
        JS_FreeValue(ctx, global);
        return NULL;  // Function not found
    }

    // Build args array — total count must include the binary arg position
    int stringArgc = args ? (*env)->GetArrayLength(env, args) : 0;
    int argc = stringArgc;
    if (binaryArgIndex >= 0 && binaryArg && binaryArgIndex >= argc) {
        argc = binaryArgIndex + 1;
    }
    JSValue *jsArgs = argc > 0 ? malloc(sizeof(JSValue) * argc) : NULL;

    int stringIdx = 0;
    for (int i = 0; i < argc; i++) {
        if (i == binaryArgIndex && binaryArg) {
            jsArgs[i] = byte_array_to_array_buffer(ctx, env, binaryArg);
        } else if (stringIdx < stringArgc) {
            jstring jstr = (jstring)(*env)->GetObjectArrayElement(env, args, stringIdx);
            stringIdx++;
            if (jstr) {
                const char *str = (*env)->GetStringUTFChars(env, jstr, NULL);
                jsArgs[i] = JS_NewString(ctx, str);
                (*env)->ReleaseStringUTFChars(env, jstr, str);
                (*env)->DeleteLocalRef(env, jstr);
            } else {
                jsArgs[i] = JS_UNDEFINED;
            }
        } else {
            jsArgs[i] = JS_UNDEFINED;
        }
    }

    // Call the function
    JSValue result = JS_Call(ctx, func, global, argc, jsArgs);

    // Free args
    for (int i = 0; i < argc; i++) {
        JS_FreeValue(ctx, jsArgs[i]);
    }
    if (jsArgs) free(jsArgs);
    JS_FreeValue(ctx, func);
    JS_FreeValue(ctx, global);

    if (JS_IsException(result)) {
        throw_js_exception(env, ctx);
        return NULL;
    }

    // Convert result - check for ArrayBuffer first
    jbyteArray binaryResult = array_buffer_to_byte_array(ctx, env, result);
    if (binaryResult) {
        JS_FreeValue(ctx, result);
        return binaryResult;
    }

    jobject jresult = js_value_to_jobject(env, ctx, result);
    JS_FreeValue(ctx, result);

    return jresult;
}
