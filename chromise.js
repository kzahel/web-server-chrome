/**
 * @author Alexey Kuzmin <alexey@alexeykuzmin.com>
 * @fileoverview Promise based wrapper for Chrome Extension API.
 * @see https://developer.chrome.com/extensions/api_index
 * @license MIT
 * @version 3.1.0
 */



;(function(global) {
  'use strict';

  let apiProxy = {
    /**
     * @param {!Object} apiObject
     * @param {string} methodName
     * @param {Arguments} callArguments Arguments to be passes to method call.
     */
    callMethod(apiObject, methodName, callArguments) {
      let originalMethod = apiObject[methodName];
      let callArgumentsArray = Array.from(callArguments);

      return new Promise((resolve, reject) => {
        let callback = apiProxy.processResponse_.bind(null, resolve, reject);
        callArgumentsArray.push(callback);
        originalMethod.apply(apiObject, callArgumentsArray);
      });
    },

    /**
     * @param {!Function} callback
     * @param {!Function} errback
     * @param {!Array} response Response from Extension API.
     * @private
     */
    processResponse_(callback, errback, ...response) {
      let error = global.chrome.runtime.lastError;
      if (typeof error == 'object') {
        errback(new Error(error.message));
        return;
      }

      if (response.length < 2)
        response = response[0];  // undefined if response is empty

      callback(response);
    }
  };


  let classifier = {
    /**
     * @param {string} letter
     * @return {boolean}
     * @private
     */
    isCapitalLetter_(letter) {
      return letter == letter.toUpperCase();
    },

    /**
     * @param {string} string
     * @return {boolean}
     * @private
     */
    startsWithCapitalLetter_(string) {
      return classifier.isCapitalLetter_(string[0]);
    },

    /**
     * We need to decide should given property be wrapped or not
     * by its name only. Retrieving its value would cause API initialization,
     * that can take a long time (dozens of ms).
     * @param {string} propName
     * @return {boolean}
     */
    propertyNeedsWrapping(propName) {
      if (classifier.startsWithCapitalLetter_(propName)) {
        // Either constructor, enum, or constant.
        return false;
      }

      if (propName.startsWith('on') &&
          classifier.isCapitalLetter_(propName[2])) {
        // Extension API event, e.g. 'onUpdated'.
        return false;
      }

      // Must be a namespace or a method.
      return true;
    }
  };


  let wrapGuy = {
    /**
     * @param {!Object} api API object to wrap.
     * @return {!Object}
     */
    wrapApi(api) {
      return wrapGuy.wrapObject_(api);
    },

    /**
     * Wraps API object.
     * @param {!Object} apiObject
     * @return {!Object}
     * @private
     */
    wrapObject_(apiObject) {
      let wrappedObject = {};

      Object.keys(apiObject)
          .filter(classifier.propertyNeedsWrapping)
          .forEach(keyName => {
            Object.defineProperty(wrappedObject, keyName, {
              enumerable: true,
              configurable: true,
              get() {
                return wrapGuy.wrapObjectField_(apiObject, keyName);
              }
            });
          });

      return wrappedObject;
    },

    /**
     * @type {!Map}
     * @private
     */
    wrappedFieldsCache_: new Map(),

    /**
     * Wraps single object field.
     * @param {!Object} apiObject
     * @param {string} keyName
     * @return {?|undefined}
     * @private
     */
    wrapObjectField_(apiObject, keyName) {
      let apiEntry = apiObject[keyName];

      if (wrapGuy.wrappedFieldsCache_.has(apiEntry)) {
        return wrapGuy.wrappedFieldsCache_.get(apiEntry);
      }

      let entryType = typeof apiEntry;
      let wrappedField;
      if (entryType == 'function') {
        wrappedField = wrapGuy.wrapMethod_(apiObject, keyName);
      }
      if (entryType == 'object') {
        wrappedField = wrapGuy.wrapObject_(apiEntry);
      }

      if (wrappedField) {
        wrapGuy.wrappedFieldsCache_.set(apiEntry, wrappedField);
        return wrappedField;
      }
    },

    /**
     * Wraps API method.
     * @param {!Object} apiObject
     * @param {string} methodName
     * @return {!Function}
     * @private
     */
    wrapMethod_(apiObject, methodName) {
      return function() {
        return apiProxy.callMethod(apiObject, methodName, arguments);
      }
    }
  };


  let chromise = wrapGuy.wrapApi(global.chrome);

  global.chromise = chromise;

}(this));
