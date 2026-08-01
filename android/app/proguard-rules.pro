# Keep Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class app.ok200.**$$serializer { *; }
-keepclassmembers class app.ok200.** {
    *** Companion;
}
-keepclasseswithmembers class app.ok200.** {
    kotlinx.serialization.KSerializer serializer(...);
}
