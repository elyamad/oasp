//     Backbone.js 1.1.0

//     (c) 2010-2011 Jeremy Ashkenas, DocumentCloud Inc.
//     (c) 2011-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(){

  // Initial Setup
  // -------------

  // Save a reference to the global object (`window` in the browser, `exports`
  // on the server).
  var root = this;

  // Save the previous value of the `Backbone` variable, so that it can be
  // restored later on, if `noConflict` is used.
  var previousBackbone = root.Backbone;

  // Create local references to array methods we'll want to use later.
  var array = [];
  var push = array.push;
  var slice = array.slice;
  var splice = array.splice;

  // The top-level namespace. All public Backbone classes and modules will
  // be attached to this. Exported for both the browser and the server.
  var Backbone;
  if (typeof exports !== 'undefined') {
    Backbone = exports;
  } else {
    Backbone = root.Backbone = {};
  }

  // Current version of the library. Keep in sync with `package.json`.
  Backbone.VERSION = '1.1.0';

  // Require Underscore, if we're on the server, and it's not already present.
  var _ = root._;
  if (!_ && (typeof require !== 'undefined')) _ = require('underscore');

  // For Backbone's purposes, jQuery, Zepto, Ender, or My Library (kidding) owns
  // the `$` variable.
  Backbone.$ = root.jQuery || root.Zepto || root.ender || root.$;

  // Runs Backbone.js in *noConflict* mode, returning the `Backbone` variable
  // to its previous owner. Returns a reference to this Backbone object.
  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  // Turn on `emulateHTTP` to support legacy HTTP servers. Setting this option
  // will fake `"PATCH"`, `"PUT"` and `"DELETE"` requests via the `_method` parameter and
  // set a `X-Http-Method-Override` header.
  Backbone.emulateHTTP = false;

  // Turn on `emulateJSON` to support legacy servers that can't deal with direct
  // `application/json` requests ... will encode the body as
  // `application/x-www-form-urlencoded` instead and will send the model in a
  // form param named `model`.
  Backbone.emulateJSON = false;

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  var Events = Backbone.Events = {

    // Bind an event to a `callback` function. Passing `"all"` will bind
    // the callback to all events fired.
    on: function(name, callback, context) {
      if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
      this._events || (this._events = {});
      var events = this._events[name] || (this._events[name] = []);
      events.push({callback: callback, context: context, ctx: context || this});
      return this;
    },

    // Bind an event to only be triggered a single time. After the first time
    // the callback is invoked, it will be removed.
    once: function(name, callback, context) {
      if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
      var self = this;
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      return this.on(name, once, context);
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var retain, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = {};
        return this;
      }
      names = name ? [name] : _.keys(this._events);
      for (i = 0, l = names.length; i < l; i++) {
        name = names[i];
        if (events = this._events[name]) {
          this._events[name] = retain = [];
          if (callback || context) {
            for (j = 0, k = events.length; j < k; j++) {
              ev = events[j];
              if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                  (context && context !== ev.context)) {
                retain.push(ev);
              }
            }
          }
          if (!retain.length) delete this._events[name];
        }
      }

      return this;
    },

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    trigger: function(name) {
      if (!this._events) return this;
      var args = slice.call(arguments, 1);
      if (!eventsApi(this, 'trigger', name, args)) return this;
      var events = this._events[name];
      var allEvents = this._events.all;
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, arguments);
      return this;
    },

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    stopListening: function(obj, name, callback) {
      var listeningTo = this._listeningTo;
      if (!listeningTo) return this;
      var remove = !name && !callback;
      if (!callback && typeof name === 'object') callback = this;
      if (obj) (listeningTo = {})[obj._listenId] = obj;
      for (var id in listeningTo) {
        obj = listeningTo[id];
        obj.off(name, callback, this);
        if (remove || _.isEmpty(obj._events)) delete this._listeningTo[id];
      }
      return this;
    }

  };

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Implement fancy features of the Events API such as multiple event
  // names `"change blur"` and jQuery-style event maps `{change: action}`
  // in terms of the existing API.
  var eventsApi = function(obj, action, name, rest) {
    if (!name) return true;

    // Handle event maps.
    if (typeof name === 'object') {
      for (var key in name) {
        obj[action].apply(obj, [key, name[key]].concat(rest));
      }
      return false;
    }

    // Handle space separated event names.
    if (eventSplitter.test(name)) {
      var names = name.split(eventSplitter);
      for (var i = 0, l = names.length; i < l; i++) {
        obj[action].apply(obj, [names[i]].concat(rest));
      }
      return false;
    }

    return true;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
    }
  };

  var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

  // Inversion-of-control versions of `on` and `once`. Tell *this* object to
  // listen to an event in another object ... keeping track of what it's
  // listening to.
  _.each(listenMethods, function(implementation, method) {
    Events[method] = function(obj, name, callback) {
      var listeningTo = this._listeningTo || (this._listeningTo = {});
      var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
      listeningTo[id] = obj;
      if (!callback && typeof name === 'object') callback = this;
      obj[implementation](name, callback, this);
      return this;
    };
  });

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Allow the `Backbone` object to serve as a global event bus, for folks who
  // want global "pubsub" in a convenient place.
  _.extend(Backbone, Events);

  // Backbone.Model
  // --------------

  // Backbone **Models** are the basic data object in the framework --
  // frequently representing a row in a table in a database on your server.
  // A discrete chunk of data and a bunch of useful, related methods for
  // performing computations and transformations on that data.

  // Create a new model with the specified attributes. A client id (`cid`)
  // is automatically generated and assigned for you.
  var Model = Backbone.Model = function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    attrs = _.defaults({}, attrs, _.result(this, 'defaults'));
    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  };

  // Attach all inheritable methods to the Model prototype.
  _.extend(Model.prototype, Events, {

    // A hash of attributes whose current and previous value differ.
    changed: null,

    // The value returned during the last failed validation.
    validationError: null,

    // The default name for the JSON `id` attribute is `"id"`. MongoDB and
    // CouchDB users may want to set this to `"_id"`.
    idAttribute: 'id',

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Return a copy of the model's `attributes` object.
    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    // Proxy `Backbone.sync` by default -- but override this if you need
    // custom syncing semantics for *this* particular model.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Get the value of an attribute.
    get: function(attr) {
      return this.attributes[attr];
    },

    // Get the HTML-escaped value of an attribute.
    escape: function(attr) {
      return _.escape(this.get(attr));
    },

    // Returns `true` if the attribute contains a value that is not null
    // or undefined.
    has: function(attr) {
      return this.get(attr) != null;
    },

    // Set a hash of model attributes on the object, firing `"change"`. This is
    // the core primitive operation of a model, updating the data and notifying
    // anyone who needs to know about the change in state. The heart of the beast.
    set: function(key, val, options) {
      var attr, attrs, unset, changes, silent, changing, prev, current;
      if (key == null) return this;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options || (options = {});

      // Run validation.
      if (!this._validate(attrs, options)) return false;

      // Extract attributes and options.
      unset           = options.unset;
      silent          = options.silent;
      changes         = [];
      changing        = this._changing;
      this._changing  = true;

      if (!changing) {
        this._previousAttributes = _.clone(this.attributes);
        this.changed = {};
      }
      current = this.attributes, prev = this._previousAttributes;

      // Check for changes of `id`.
      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      // For each `set` attribute, update or delete the current value.
      for (attr in attrs) {
        val = attrs[attr];
        if (!_.isEqual(current[attr], val)) changes.push(attr);
        if (!_.isEqual(prev[attr], val)) {
          this.changed[attr] = val;
        } else {
          delete this.changed[attr];
        }
        unset ? delete current[attr] : current[attr] = val;
      }

      // Trigger all relevant attribute changes.
      if (!silent) {
        if (changes.length) this._pending = true;
        for (var i = 0, l = changes.length; i < l; i++) {
          this.trigger('change:' + changes[i], this, current[changes[i]], options);
        }
      }

      // You might be wondering why there's a `while` loop here. Changes can
      // be recursively nested within `"change"` events.
      if (changing) return this;
      if (!silent) {
        while (this._pending) {
          this._pending = false;
          this.trigger('change', this, options);
        }
      }
      this._pending = false;
      this._changing = false;
      return this;
    },

    // Remove an attribute from the model, firing `"change"`. `unset` is a noop
    // if the attribute doesn't exist.
    unset: function(attr, options) {
      return this.set(attr, void 0, _.extend({}, options, {unset: true}));
    },

    // Clear all attributes on the model, firing `"change"`.
    clear: function(options) {
      var attrs = {};
      for (var key in this.attributes) attrs[key] = void 0;
      return this.set(attrs, _.extend({}, options, {unset: true}));
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false;
      var old = this._changing ? this._previousAttributes : this.attributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    // Get the previous value of an attribute, recorded at the time the last
    // `"change"` event was fired.
    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    // Fetch the model from the server. If the server's representation of the
    // model differs from its current attributes, they will be overridden,
    // triggering a `"change"` event.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        if (!model.set(model.parse(resp, options), options)) return false;
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Set a hash of model attributes, and sync the model to the server.
    // If the server returns an attributes hash that differs, the model's
    // state will be `set` again.
    save: function(key, val, options) {
      var attrs, method, xhr, attributes = this.attributes;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === 'object') {
        attrs = key;
        options = val;
      } else {
        (attrs = {})[key] = val;
      }

      options = _.extend({validate: true}, options);

      // If we're not waiting and attributes exist, save acts as
      // `set(attr).save(null, opts)` with validation. Otherwise, check if
      // the model will be valid when the attributes, if any, are set.
      if (attrs && !options.wait) {
        if (!this.set(attrs, options)) return false;
      } else {
        if (!this._validate(attrs, options)) return false;
      }

      // Set temporary attributes if `{wait: true}`.
      if (attrs && options.wait) {
        this.attributes = _.extend({}, attributes, attrs);
      }

      // After a successful server-side save, the client is (optionally)
      // updated with the server-side state.
      if (options.parse === void 0) options.parse = true;
      var model = this;
      var success = options.success;
      options.success = function(resp) {
        // Ensure attributes are restored during synchronous saves.
        model.attributes = attributes;
        var serverAttrs = model.parse(resp, options);
        if (options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (_.isObject(serverAttrs) && !model.set(serverAttrs, options)) {
          return false;
        }
        if (success) success(model, resp, options);
        model.trigger('sync', model, resp, options);
      };
      wrapError(this, options);

      method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');
      if (method === 'patch') options.attrs = attrs;
      xhr = this.sync(method, this, options);

      // Restore attributes.
      if (attrs && options.wait) this.attributes = attributes;

      return xhr;
    },

    // Destroy this model on the server if it was already persisted.
    // Optimistically removes the model from its collection, if it has one.
    // If `wait: true` is passed, waits for the server to respond before removal.
    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;

      var destroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (options.wait || model.isNew()) destroy();
        if (success) success(model, resp, options);
        if (!model.isNew()) model.trigger('sync', model, resp, options);
      };

      if (this.isNew()) {
        options.success();
        return false;
      }
      wrapError(this, options);

      var xhr = this.sync('delete', this, options);
      if (!options.wait) destroy();
      return xhr;
    },

    // Default URL for the model's representation on the server -- if you're
    // using Backbone's restful methods, override this to change the endpoint
    // that will be called.
    url: function() {
      var base = _.result(this, 'urlRoot') || _.result(this.collection, 'url') || urlError();
      if (this.isNew()) return base;
      return base + (base.charAt(base.length - 1) === '/' ? '' : '/') + encodeURIComponent(this.id);
    },

    // **parse** converts a response into the hash of attributes to be `set` on
    // the model. The default implementation is just to pass the response along.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new model with identical attributes to this one.
    clone: function() {
      return new this.constructor(this.attributes);
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function() {
      return this.id == null;
    },

    // Check if the model is currently in a valid state.
    isValid: function(options) {
      return this._validate({}, _.extend(options || {}, { validate: true }));
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function(attrs, options) {
      if (!options.validate || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validationError = this.validate(attrs, options) || null;
      if (!error) return true;
      this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
      return false;
    }

  });

  // Underscore methods that we want to implement on the Model.
  var modelMethods = ['keys', 'values', 'pairs', 'invert', 'pick', 'omit'];

  // Mix in each Underscore method as a proxy to `Model#attributes`.
  _.each(modelMethods, function(method) {
    Model.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.attributes);
      return _[method].apply(_, args);
    };
  });

  // Backbone.Collection
  // -------------------

  // If models tend to represent a single row of data, a Backbone Collection is
  // more analagous to a table full of data ... or a small slice or page of that
  // table, or a collection of rows that belong together for a particular reason
  // -- all of the messages in this particular folder, all of the documents
  // belonging to this particular author, and so on. Collections maintain
  // indexes of their models, both in order, and for lookup by `id`.

  // Create a new **Collection**, perhaps to contain a specific type of `model`.
  // If a `comparator` is specified, the Collection will maintain
  // its models in sort order, as they're added and removed.
  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, _.extend({silent: true}, options));
  };

  // Default options for `Collection#set`.
  var setOptions = {add: true, remove: true, merge: true};
  var addOptions = {add: true, remove: false};

  // Define the Collection's inheritable methods.
  _.extend(Collection.prototype, Events, {

    // The default model for a collection is just a **Backbone.Model**.
    // This should be overridden in most cases.
    model: Model,

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // The JSON representation of a Collection is an array of the
    // models' attributes.
    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    // Proxy `Backbone.sync` by default.
    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    // Add a model, or list of models to the set.
    add: function(models, options) {
      return this.set(models, _.extend({merge: false}, options, addOptions));
    },

    // Remove a model, or a list of models from the set.
    remove: function(models, options) {
      var singular = !_.isArray(models);
      models = singular ? [models] : _.clone(models);
      options || (options = {});
      var i, l, index, model;
      for (i = 0, l = models.length; i < l; i++) {
        model = models[i] = this.get(models[i]);
        if (!model) continue;
        delete this._byId[model.id];
        delete this._byId[model.cid];
        index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        this._removeReference(model);
      }
      return singular ? models[0] : models;
    },

    // Update a collection by `set`-ing a new list of models, adding new ones,
    // removing models that are no longer present, and merging models that
    // already exist in the collection, as necessary. Similar to **Model#set**,
    // the core operation for updating the data contained by the collection.
    set: function(models, options) {
      options = _.defaults({}, options, setOptions);
      if (options.parse) models = this.parse(models, options);
      var singular = !_.isArray(models);
      models = singular ? (models ? [models] : []) : _.clone(models);
      var i, l, id, model, attrs, existing, sort;
      var at = options.at;
      var targetModel = this.model;
      var sortable = this.comparator && (at == null) && options.sort !== false;
      var sortAttr = _.isString(this.comparator) ? this.comparator : null;
      var toAdd = [], toRemove = [], modelMap = {};
      var add = options.add, merge = options.merge, remove = options.remove;
      var order = !sortable && add && remove ? [] : false;

      // Turn bare objects into model references, and prevent invalid models
      // from being added.
      for (i = 0, l = models.length; i < l; i++) {
        attrs = models[i];
        if (attrs instanceof Model) {
          id = model = attrs;
        } else {
          id = attrs[targetModel.prototype.idAttribute];
        }

        // If a duplicate is found, prevent it from being added and
        // optionally merge it into the existing model.
        if (existing = this.get(id)) {
          if (remove) modelMap[existing.cid] = true;
          if (merge) {
            attrs = attrs === model ? model.attributes : attrs;
            if (options.parse) attrs = existing.parse(attrs, options);
            existing.set(attrs, options);
            if (sortable && !sort && existing.hasChanged(sortAttr)) sort = true;
          }
          models[i] = existing;

        // If this is a new, valid model, push it to the `toAdd` list.
        } else if (add) {
          model = models[i] = this._prepareModel(attrs, options);
          if (!model) continue;
          toAdd.push(model);

          // Listen to added models' events, and index models for lookup by
          // `id` and by `cid`.
          model.on('all', this._onModelEvent, this);
          this._byId[model.cid] = model;
          if (model.id != null) this._byId[model.id] = model;
        }
        if (order) order.push(existing || model);
      }

      // Remove nonexistent models if appropriate.
      if (remove) {
        for (i = 0, l = this.length; i < l; ++i) {
          if (!modelMap[(model = this.models[i]).cid]) toRemove.push(model);
        }
        if (toRemove.length) this.remove(toRemove, options);
      }

      // See if sorting is needed, update `length` and splice in new models.
      if (toAdd.length || (order && order.length)) {
        if (sortable) sort = true;
        this.length += toAdd.length;
        if (at != null) {
          for (i = 0, l = toAdd.length; i < l; i++) {
            this.models.splice(at + i, 0, toAdd[i]);
          }
        } else {
          if (order) this.models.length = 0;
          var orderedModels = order || toAdd;
          for (i = 0, l = orderedModels.length; i < l; i++) {
            this.models.push(orderedModels[i]);
          }
        }
      }

      // Silently sort the collection if appropriate.
      if (sort) this.sort({silent: true});

      // Unless silenced, it's time to fire all appropriate add/sort events.
      if (!options.silent) {
        for (i = 0, l = toAdd.length; i < l; i++) {
          (model = toAdd[i]).trigger('add', model, this, options);
        }
        if (sort || (order && order.length)) this.trigger('sort', this, options);
      }
      
      // Return the added (or merged) model (or models).
      return singular ? models[0] : models;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function(models, options) {
      options || (options = {});
      for (var i = 0, l = this.models.length; i < l; i++) {
        this._removeReference(this.models[i]);
      }
      options.previousModels = this.models;
      this._reset();
      models = this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return models;
    },

    // Add a model to the end of the collection.
    push: function(model, options) {
      return this.add(model, _.extend({at: this.length}, options));
    },

    // Remove a model from the end of the collection.
    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    // Add a model to the beginning of the collection.
    unshift: function(model, options) {
      return this.add(model, _.extend({at: 0}, options));
    },

    // Remove a model from the beginning of the collection.
    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    // Slice out a sub-array of models from the collection.
    slice: function() {
      return slice.apply(this.models, arguments);
    },

    // Get a model from the set by id.
    get: function(obj) {
      if (obj == null) return void 0;
      return this._byId[obj.id] || this._byId[obj.cid] || this._byId[obj];
    },

    // Get the model at the given index.
    at: function(index) {
      return this.models[index];
    },

    // Return models with matching attributes. Useful for simple cases of
    // `filter`.
    where: function(attrs, first) {
      if (_.isEmpty(attrs)) return first ? void 0 : [];
      return this[first ? 'find' : 'filter'](function(model) {
        for (var key in attrs) {
          if (attrs[key] !== model.get(key)) return false;
        }
        return true;
      });
    },

    // Return the first model with matching attributes. Useful for simple cases
    // of `find`.
    findWhere: function(attrs) {
      return this.where(attrs, true);
    },

    // Force the collection to re-sort itself. You don't need to call this under
    // normal circumstances, as the set will maintain sort order as each item
    // is added.
    sort: function(options) {
      if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
      options || (options = {});

      // Run sort based on type of `comparator`.
      if (_.isString(this.comparator) || this.comparator.length === 1) {
        this.models = this.sortBy(this.comparator, this);
      } else {
        this.models.sort(_.bind(this.comparator, this));
      }

      if (!options.silent) this.trigger('sort', this, options);
      return this;
    },

    // Pluck an attribute from each model in the collection.
    pluck: function(attr) {
      return _.invoke(this.models, 'get', attr);
    },

    // Fetch the default set of models for this collection, resetting the
    // collection when they arrive. If `reset: true` is passed, the response
    // data will be passed through the `reset` method instead of `set`.
    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var success = options.success;
      var collection = this;
      options.success = function(resp) {
        var method = options.reset ? 'reset' : 'set';
        collection[method](resp, options);
        if (success) success(collection, resp, options);
        collection.trigger('sync', collection, resp, options);
      };
      wrapError(this, options);
      return this.sync('read', this, options);
    },

    // Create a new instance of a model in this collection. Add the model to the
    // collection immediately, unless `wait: true` is passed, in which case we
    // wait for the server to agree.
    create: function(model, options) {
      options = options ? _.clone(options) : {};
      if (!(model = this._prepareModel(model, options))) return false;
      if (!options.wait) this.add(model, options);
      var collection = this;
      var success = options.success;
      options.success = function(model, resp, options) {
        if (options.wait) collection.add(model, options);
        if (success) success(model, resp, options);
      };
      model.save(null, options);
      return model;
    },

    // **parse** converts a response into a list of models to be added to the
    // collection. The default implementation is just to pass it through.
    parse: function(resp, options) {
      return resp;
    },

    // Create a new collection with an identical list of models as this one.
    clone: function() {
      return new this.constructor(this.models);
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function() {
      this.length = 0;
      this.models = [];
      this._byId  = {};
    },

    // Prepare a hash of attributes (or other model) to be added to this
    // collection.
    _prepareModel: function(attrs, options) {
      if (attrs instanceof Model) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options = options ? _.clone(options) : {};
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model.validationError) return model;
      this.trigger('invalid', this, model.validationError, options);
      return false;
    },

    // Internal method to sever a model's ties to a collection.
    _removeReference: function(model) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    // Internal method called every time a model in the set fires an event.
    // Sets need to update their indexes when models change ids. All other
    // events simply proxy through. "add" and "remove" events that originate
    // in other collections are ignored.
    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (model && event === 'change:' + model.idAttribute) {
        delete this._byId[model.previous(model.idAttribute)];
        if (model.id != null) this._byId[model.id] = model;
      }
      this.trigger.apply(this, arguments);
    }

  });

  // Underscore methods that we want to implement on the Collection.
  // 90% of the core usefulness of Backbone Collections is actually implemented
  // right here:
  var methods = ['forEach', 'each', 'map', 'collect', 'reduce', 'foldl',
    'inject', 'reduceRight', 'foldr', 'find', 'detect', 'filter', 'select',
    'reject', 'every', 'all', 'some', 'any', 'include', 'contains', 'invoke',
    'max', 'min', 'toArray', 'size', 'first', 'head', 'take', 'initial', 'rest',
    'tail', 'drop', 'last', 'without', 'difference', 'indexOf', 'shuffle',
    'lastIndexOf', 'isEmpty', 'chain'];

  // Mix in each Underscore method as a proxy to `Collection#models`.
  _.each(methods, function(method) {
    Collection.prototype[method] = function() {
      var args = slice.call(arguments);
      args.unshift(this.models);
      return _[method].apply(_, args);
    };
  });

  // Underscore methods that take a property name as an argument.
  var attributeMethods = ['groupBy', 'countBy', 'sortBy'];

  // Use attributes instead of properties.
  _.each(attributeMethods, function(method) {
    Collection.prototype[method] = function(value, context) {
      var iterator = _.isFunction(value) ? value : function(model) {
        return model.get(value);
      };
      return _[method](this.models, iterator, context);
    };
  });

  // Backbone.View
  // -------------

  // Backbone Views are almost more convention than they are actual code. A View
  // is simply a JavaScript object that represents a logical chunk of UI in the
  // DOM. This might be a single item, an entire list, a sidebar or panel, or
  // even the surrounding frame which wraps your whole app. Defining a chunk of
  // UI as a **View** allows you to define your DOM events declaratively, without
  // having to worry about render order ... and makes it easy for the view to
  // react to specific changes in the state of your models.

  // Creating a Backbone.View creates its initial element outside of the DOM,
  // if an existing element is not provided...
  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    options || (options = {});
    _.extend(this, _.pick(options, viewOptions));
    this._ensureElement();
    this.initialize.apply(this, arguments);
    this.delegateEvents();
  };

  // Cached regex to split keys for `delegate`.
  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  // List of view options to be merged as properties.
  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName', 'events'];

  // Set up all inheritable **Backbone.View** properties and methods.
  _.extend(View.prototype, Events, {

    // The default `tagName` of a View's element is `"div"`.
    tagName: 'div',

    // jQuery delegate for element lookup, scoped to DOM elements within the
    // current view. This should be preferred to global lookups where possible.
    $: function(selector) {
      return this.$el.find(selector);
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // **render** is the core function that your view should override, in order
    // to populate its element (`this.el`), with the appropriate HTML. The
    // convention is for **render** to always return `this`.
    render: function() {
      return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable Backbone.Events listeners.
    remove: function() {
      this.$el.remove();
      this.stopListening();
      return this;
    },

    // Change the view's element (`this.el` property), including event
    // re-delegation.
    setElement: function(element, delegate) {
      if (this.$el) this.undelegateEvents();
      this.$el = element instanceof Backbone.$ ? element : Backbone.$(element);
      this.el = this.$el[0];
      if (delegate !== false) this.delegateEvents();
      return this;
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save',
    //       'click .open':       function(e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    // This only works for delegate-able events: not `focus`, `blur`, and
    // not `change`, `submit`, and `reset` in Internet Explorer.
    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return this;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) continue;

        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        method = _.bind(method, this);
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
          this.$el.on(eventName, method);
        } else {
          this.$el.on(eventName, selector, method);
        }
      }
      return this;
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function() {
      this.$el.off('.delegateEvents' + this.cid);
      return this;
    },

    // Ensure that the View has a DOM element to render into.
    // If `this.el` is a string, pass it through `$()`, take the first
    // matching element, and re-assign it to `el`. Otherwise, create
    // an element from the `id`, `className` and `tagName` properties.
    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        var $el = Backbone.$('<' + _.result(this, 'tagName') + '>').attr(attrs);
        this.setElement($el, false);
      } else {
        this.setElement(_.result(this, 'el'), false);
      }
    }

  });

  // Backbone.sync
  // -------------

  // Override this function to change the manner in which Backbone persists
  // models to the server. You will be passed the type of request, and the
  // model in question. By default, makes a RESTful Ajax request
  // to the model's `url()`. Some possible customizations could be:
  //
  // * Use `setTimeout` to batch rapid-fire updates into a single request.
  // * Send up the models as XML instead of JSON.
  // * Persist models via WebSockets instead of Ajax.
  //
  // Turn on `Backbone.emulateHTTP` in order to send `PUT` and `DELETE` requests
  // as `POST`, with a `_method` parameter containing the true HTTP method,
  // as well as all requests with the body as `application/x-www-form-urlencoded`
  // instead of `application/json` with the model in a param named `model`.
  // Useful when interfacing with server-side languages like **PHP** that make
  // it difficult to read the body of `PUT` requests.
  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    // Default options, unless specified.
    _.defaults(options || (options = {}), {
      emulateHTTP: Backbone.emulateHTTP,
      emulateJSON: Backbone.emulateJSON
    });

    // Default JSON-request options.
    var params = {type: type, dataType: 'json'};

    // Ensure that we have a URL.
    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    // Ensure that we have the appropriate request data.
    if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(options.attrs || model.toJSON(options));
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (options.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    // For older servers, emulate HTTP by mimicking the HTTP method with `_method`
    // And an `X-HTTP-Method-Override` header.
    if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
      params.type = 'POST';
      if (options.emulateJSON) params.data._method = type;
      var beforeSend = options.beforeSend;
      options.beforeSend = function(xhr) {
        xhr.setRequestHeader('X-HTTP-Method-Override', type);
        if (beforeSend) return beforeSend.apply(this, arguments);
      };
    }

    // Don't process data on a non-GET request.
    if (params.type !== 'GET' && !options.emulateJSON) {
      params.processData = false;
    }

    // If we're sending a `PATCH` request, and we're in an old Internet Explorer
    // that still has ActiveX enabled by default, override jQuery to use that
    // for XHR instead. Remove this line when jQuery supports `PATCH` on IE8.
    if (params.type === 'PATCH' && noXhrPatch) {
      params.xhr = function() {
        return new ActiveXObject("Microsoft.XMLHTTP");
      };
    }

    // Make the request, allowing the user to override any Ajax options.
    var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
    model.trigger('request', model, xhr, options);
    return xhr;
  };

  var noXhrPatch = typeof window !== 'undefined' && !!window.ActiveXObject && !(window.XMLHttpRequest && (new XMLHttpRequest).dispatchEvent);

  // Map from CRUD to HTTP for our default `Backbone.sync` implementation.
  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'patch':  'PATCH',
    'delete': 'DELETE',
    'read':   'GET'
  };

  // Set the default implementation of `Backbone.ajax` to proxy through to `$`.
  // Override this if you'd like to use a different library.
  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };

  // Backbone.Router
  // ---------------

  // Routers map faux-URLs to actions, and fire events when routes are
  // matched. Creating a new one sets its `routes` hash, if not set statically.
  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  // Cached regular expressions for matching named param parts and splatted
  // parts of route strings.
  var optionalParam = /\((.*?)\)/g;
  var namedParam    = /(\(\?)?:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

  // Set up all inheritable **Backbone.Router** properties and methods.
  _.extend(Router.prototype, Events, {

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function(){},

    // Manually bind a single named route to a callback. For example:
    //
    //     this.route('search/:query/p:num', 'search', function(query, num) {
    //       ...
    //     });
    //
    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (_.isFunction(name)) {
        callback = name;
        name = '';
      }
      if (!callback) callback = this[name];
      var router = this;
      Backbone.history.route(route, function(fragment) {
        var args = router._extractParameters(route, fragment);
        callback && callback.apply(router, args);
        router.trigger.apply(router, ['route:' + name].concat(args));
        router.trigger('route', name, args);
        Backbone.history.trigger('route', router, name, args);
      });
      return this;
    },

    // Simple proxy to `Backbone.history` to save a fragment into the history.
    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
      return this;
    },

    // Bind all defined routes to `Backbone.history`. We have to reverse the
    // order of the routes here to support behavior where the most general
    // routes can be defined at the bottom of the route map.
    _bindRoutes: function() {
      if (!this.routes) return;
      this.routes = _.result(this, 'routes');
      var route, routes = _.keys(this.routes);
      while ((route = routes.pop()) != null) {
        this.route(route, this.routes[route]);
      }
    },

    // Convert a route string into a regular expression, suitable for matching
    // against the current location hash.
    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(optionalParam, '(?:$1)?')
                   .replace(namedParam, function(match, optional) {
                     return optional ? match : '([^\/]+)';
                   })
                   .replace(splatParam, '(.*?)');
      return new RegExp('^' + route + '$');
    },

    // Given a route, and a URL fragment that it matches, return the array of
    // extracted decoded parameters. Empty or unmatched parameters will be
    // treated as `null` to normalize cross-browser behavior.
    _extractParameters: function(route, fragment) {
      var params = route.exec(fragment).slice(1);
      return _.map(params, function(param) {
        return param ? decodeURIComponent(param) : null;
      });
    }

  });

  // Backbone.History
  // ----------------

  // Handles cross-browser history management, based on either
  // [pushState](http://diveintohtml5.info/history.html) and real URLs, or
  // [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
  // and URL fragments. If the browser supports neither (old IE, natch),
  // falls back to polling.
  var History = Backbone.History = function() {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');

    // Ensure that `History` can be used outside of the browser.
    if (typeof window !== 'undefined') {
      this.location = window.location;
      this.history = window.history;
    }
  };

  // Cached regex for stripping a leading hash/slash and trailing space.
  var routeStripper = /^[#\/]|\s+$/g;

  // Cached regex for stripping leading and trailing slashes.
  var rootStripper = /^\/+|\/+$/g;

  // Cached regex for detecting MSIE.
  var isExplorer = /msie [\w.]+/;

  // Cached regex for removing a trailing slash.
  var trailingSlash = /\/$/;

  // Cached regex for stripping urls of hash and query.
  var pathStripper = /[?#].*$/;

  // Has the history handling already been started?
  History.started = false;

  // Set up all inheritable **Backbone.History** properties and methods.
  _.extend(History.prototype, Events, {

    // The default interval to poll for hash changes, if necessary, is
    // twenty times a second.
    interval: 50,

    // Gets the true hash value. Cannot use location.hash directly due to bug
    // in Firefox where location.hash will always be decoded.
    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    // Get the cross-browser normalized URL fragment, either from the URL,
    // the hash, or the override.
    getFragment: function(fragment, forcePushState) {
      if (fragment == null) {
        if (this._hasPushState || !this._wantsHashChange || forcePushState) {
          fragment = this.location.pathname;
          var root = this.root.replace(trailingSlash, '');
          if (!fragment.indexOf(root)) fragment = fragment.slice(root.length);
        } else {
          fragment = this.getHash();
        }
      }
      return fragment.replace(routeStripper, '');
    },

    // Start the hash change handling, returning `true` if the current URL matches
    // an existing route, and `false` otherwise.
    start: function(options) {
      if (History.started) throw new Error("Backbone.history has already been started");
      History.started = true;

      // Figure out the initial configuration. Do we need an iframe?
      // Is pushState desired ... is it available?
      this.options          = _.extend({root: '/'}, this.options, options);
      this.root             = this.options.root;
      this._wantsHashChange = this.options.hashChange !== false;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
      var fragment          = this.getFragment();
      var docMode           = document.documentMode;
      var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

      // Normalize root to always include a leading and trailing slash.
      this.root = ('/' + this.root + '/').replace(rootStripper, '/');

      if (oldIE && this._wantsHashChange) {
        this.iframe = Backbone.$('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
        this.navigate(fragment);
      }

      // Depending on whether we're using pushState or hashes, and whether
      // 'onhashchange' is supported, determine how we check the URL state.
      if (this._hasPushState) {
        Backbone.$(window).on('popstate', this.checkUrl);
      } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
        Backbone.$(window).on('hashchange', this.checkUrl);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      // Determine if we need to change the base url, for a pushState link
      // opened by a non-pushState browser.
      this.fragment = fragment;
      var loc = this.location;
      var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === this.root;

      // Transition from hashChange to pushState or vice versa if both are
      // requested.
      if (this._wantsHashChange && this._wantsPushState) {

        // If we've started off with a route from a `pushState`-enabled
        // browser, but we're currently in a browser that doesn't support it...
        if (!this._hasPushState && !atRoot) {
          this.fragment = this.getFragment(null, true);
          this.location.replace(this.root + this.location.search + '#' + this.fragment);
          // Return immediately as browser will do redirect to new url
          return true;

        // Or if we've started out with a hash-based route, but we're currently
        // in a browser where it could be `pushState`-based instead...
        } else if (this._hasPushState && atRoot && loc.hash) {
          this.fragment = this.getHash().replace(routeStripper, '');
          this.history.replaceState({}, document.title, this.root + this.fragment + loc.search);
        }

      }

      if (!this.options.silent) return this.loadUrl();
    },

    // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
    // but possibly useful for unit testing Routers.
    stop: function() {
      Backbone.$(window).off('popstate', this.checkUrl).off('hashchange', this.checkUrl);
      clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    // Add a route to be tested when the fragment changes. Routes added later
    // may override previous routes.
    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    // Checks the current URL to see if it has changed, and if it has,
    // calls `loadUrl`, normalizing across the hidden iframe.
    checkUrl: function(e) {
      var current = this.getFragment();
      if (current === this.fragment && this.iframe) {
        current = this.getFragment(this.getHash(this.iframe));
      }
      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl();
    },

    // Attempt to load the current URL fragment. If a route succeeds with a
    // match, returns `true`. If no defined routes matches the fragment,
    // returns `false`.
    loadUrl: function(fragment) {
      fragment = this.fragment = this.getFragment(fragment);
      return _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
    },

    // Save a fragment into the hash history, or replace the URL state if the
    // 'replace' option is passed. You are responsible for properly URL-encoding
    // the fragment in advance.
    //
    // The options object can contain `trigger: true` if you wish to have the
    // route callback be fired (not usually desirable), or `replace: true`, if
    // you wish to modify the current URL without adding an entry to the history.
    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: !!options};

      var url = this.root + (fragment = this.getFragment(fragment || ''));

      // Strip the fragment of the query and hash for matching.
      fragment = fragment.replace(pathStripper, '');

      if (this.fragment === fragment) return;
      this.fragment = fragment;

      // Don't include a trailing slash on the root.
      if (fragment === '' && url !== '/') url = url.slice(0, -1);

      // If pushState is available, we use it to set the fragment as a real URL.
      if (this._hasPushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      // If hash changes haven't been explicitly disabled, update the hash
      // fragment to store history.
      } else if (this._wantsHashChange) {
        this._updateHash(this.location, fragment, options.replace);
        if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
          // Opening and closing the iframe tricks IE7 and earlier to push a
          // history entry on hash-tag change.  When replace is true, we don't
          // want this.
          if(!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, fragment, options.replace);
        }

      // If you've told us that you explicitly don't want fallback hashchange-
      // based history, then `navigate` becomes a page refresh.
      } else {
        return this.location.assign(url);
      }
      if (options.trigger) return this.loadUrl(fragment);
    },

    // Update the hash location, either replacing the current entry, or adding
    // a new one to the browser history.
    _updateHash: function(location, fragment, replace) {
      if (replace) {
        var href = location.href.replace(/(javascript:|#).*$/, '');
        location.replace(href + '#' + fragment);
      } else {
        // Some browsers require that `hash` contains a leading #.
        location.hash = '#' + fragment;
      }
    }

  });

  // Create the default Backbone.history.
  Backbone.history = new History;

  // Helpers
  // -------

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Add static properties to the constructor function, if supplied.
    _.extend(child, parent, staticProps);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Set up inheritance for the model, collection, router, view and history.
  Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

  // Throw an error when a URL is needed, and none is supplied.
  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  // Wrap an optional error callback with a fallback error event.
  var wrapError = function(model, options) {
    var error = options.error;
    options.error = function(resp) {
      if (error) error(model, resp, options);
      model.trigger('error', model, resp, options);
    };
  };

}).call(this);

define("backbone", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Backbone;
    };
}(this)));

// MarionetteJS (Backbone.Marionette)
// ----------------------------------
// v1.6.3
//
// Copyright (c)2014 Derick Bailey, Muted Solutions, LLC.
// Distributed under MIT license
//
// http://marionettejs.com



/*!
 * Includes BabySitter
 * https://github.com/marionettejs/backbone.babysitter/
 *
 * Includes Wreqr
 * https://github.com/marionettejs/backbone.wreqr/
 */

// Backbone.BabySitter
// -------------------
// v0.1.0
//
// Copyright (c)2014 Derick Bailey, Muted Solutions, LLC.
// Distributed under MIT license
//
// http://github.com/marionettejs/backbone.babysitter

// Backbone.ChildViewContainer
// ---------------------------
//
// Provide a container to store, retrieve and
// shut down child views.

Backbone.ChildViewContainer = (function(Backbone, _){
  
  // Container Constructor
  // ---------------------

  var Container = function(views){
    this._views = {};
    this._indexByModel = {};
    this._indexByCustom = {};
    this._updateLength();

    _.each(views, this.add, this);
  };

  // Container Methods
  // -----------------

  _.extend(Container.prototype, {

    // Add a view to this container. Stores the view
    // by `cid` and makes it searchable by the model
    // cid (and model itself). Optionally specify
    // a custom key to store an retrieve the view.
    add: function(view, customIndex){
      var viewCid = view.cid;

      // store the view
      this._views[viewCid] = view;

      // index it by model
      if (view.model){
        this._indexByModel[view.model.cid] = viewCid;
      }

      // index by custom
      if (customIndex){
        this._indexByCustom[customIndex] = viewCid;
      }

      this._updateLength();
      return this;
    },

    // Find a view by the model that was attached to
    // it. Uses the model's `cid` to find it.
    findByModel: function(model){
      return this.findByModelCid(model.cid);
    },

    // Find a view by the `cid` of the model that was attached to
    // it. Uses the model's `cid` to find the view `cid` and
    // retrieve the view using it.
    findByModelCid: function(modelCid){
      var viewCid = this._indexByModel[modelCid];
      return this.findByCid(viewCid);
    },

    // Find a view by a custom indexer.
    findByCustom: function(index){
      var viewCid = this._indexByCustom[index];
      return this.findByCid(viewCid);
    },

    // Find by index. This is not guaranteed to be a
    // stable index.
    findByIndex: function(index){
      return _.values(this._views)[index];
    },

    // retrieve a view by its `cid` directly
    findByCid: function(cid){
      return this._views[cid];
    },

    // Remove a view
    remove: function(view){
      var viewCid = view.cid;

      // delete model index
      if (view.model){
        delete this._indexByModel[view.model.cid];
      }

      // delete custom index
      _.any(this._indexByCustom, function(cid, key) {
        if (cid === viewCid) {
          delete this._indexByCustom[key];
          return true;
        }
      }, this);

      // remove the view from the container
      delete this._views[viewCid];

      // update the length
      this._updateLength();
      return this;
    },

    // Call a method on every view in the container,
    // passing parameters to the call method one at a
    // time, like `function.call`.
    call: function(method){
      this.apply(method, _.tail(arguments));
    },

    // Apply a method on every view in the container,
    // passing parameters to the call method one at a
    // time, like `function.apply`.
    apply: function(method, args){
      _.each(this._views, function(view){
        if (_.isFunction(view[method])){
          view[method].apply(view, args || []);
        }
      });
    },

    // Update the `.length` attribute on this container
    _updateLength: function(){
      this.length = _.size(this._views);
    }
  });

  // Borrowing this code from Backbone.Collection:
  // http://backbonejs.org/docs/backbone.html#section-106
  //
  // Mix in methods from Underscore, for iteration, and other
  // collection related features.
  var methods = ['forEach', 'each', 'map', 'find', 'detect', 'filter', 
    'select', 'reject', 'every', 'all', 'some', 'any', 'include', 
    'contains', 'invoke', 'toArray', 'first', 'initial', 'rest', 
    'last', 'without', 'isEmpty', 'pluck'];

  _.each(methods, function(method) {
    Container.prototype[method] = function() {
      var views = _.values(this._views);
      var args = [views].concat(_.toArray(arguments));
      return _[method].apply(_, args);
    };
  });

  // return the public API
  return Container;
})(Backbone, _);

// Backbone.Wreqr (Backbone.Marionette)
// ----------------------------------
// v1.0.0
//
// Copyright (c)2014 Derick Bailey, Muted Solutions, LLC.
// Distributed under MIT license
//
// http://github.com/marionettejs/backbone.wreqr


Backbone.Wreqr = (function(Backbone, Marionette, _){
  "use strict";
  var Wreqr = {};

  // Handlers
// --------
// A registry of functions to call, given a name

Wreqr.Handlers = (function(Backbone, _){
  "use strict";
  
  // Constructor
  // -----------

  var Handlers = function(options){
    this.options = options;
    this._wreqrHandlers = {};
    
    if (_.isFunction(this.initialize)){
      this.initialize(options);
    }
  };

  Handlers.extend = Backbone.Model.extend;

  // Instance Members
  // ----------------

  _.extend(Handlers.prototype, Backbone.Events, {

    // Add multiple handlers using an object literal configuration
    setHandlers: function(handlers){
      _.each(handlers, function(handler, name){
        var context = null;

        if (_.isObject(handler) && !_.isFunction(handler)){
          context = handler.context;
          handler = handler.callback;
        }

        this.setHandler(name, handler, context);
      }, this);
    },

    // Add a handler for the given name, with an
    // optional context to run the handler within
    setHandler: function(name, handler, context){
      var config = {
        callback: handler,
        context: context
      };

      this._wreqrHandlers[name] = config;

      this.trigger("handler:add", name, handler, context);
    },

    // Determine whether or not a handler is registered
    hasHandler: function(name){
      return !! this._wreqrHandlers[name];
    },

    // Get the currently registered handler for
    // the specified name. Throws an exception if
    // no handler is found.
    getHandler: function(name){
      var config = this._wreqrHandlers[name];

      if (!config){
        throw new Error("Handler not found for '" + name + "'");
      }

      return function(){
        var args = Array.prototype.slice.apply(arguments);
        return config.callback.apply(config.context, args);
      };
    },

    // Remove a handler for the specified name
    removeHandler: function(name){
      delete this._wreqrHandlers[name];
    },

    // Remove all handlers from this registry
    removeAllHandlers: function(){
      this._wreqrHandlers = {};
    }
  });

  return Handlers;
})(Backbone, _);

  // Wreqr.CommandStorage
// --------------------
//
// Store and retrieve commands for execution.
Wreqr.CommandStorage = (function(){
  "use strict";

  // Constructor function
  var CommandStorage = function(options){
    this.options = options;
    this._commands = {};

    if (_.isFunction(this.initialize)){
      this.initialize(options);
    }
  };

  // Instance methods
  _.extend(CommandStorage.prototype, Backbone.Events, {

    // Get an object literal by command name, that contains
    // the `commandName` and the `instances` of all commands
    // represented as an array of arguments to process
    getCommands: function(commandName){
      var commands = this._commands[commandName];

      // we don't have it, so add it
      if (!commands){

        // build the configuration
        commands = {
          command: commandName, 
          instances: []
        };

        // store it
        this._commands[commandName] = commands;
      }

      return commands;
    },

    // Add a command by name, to the storage and store the
    // args for the command
    addCommand: function(commandName, args){
      var command = this.getCommands(commandName);
      command.instances.push(args);
    },

    // Clear all commands for the given `commandName`
    clearCommands: function(commandName){
      var command = this.getCommands(commandName);
      command.instances = [];
    }
  });

  return CommandStorage;
})();

  // Wreqr.Commands
// --------------
//
// A simple command pattern implementation. Register a command
// handler and execute it.
Wreqr.Commands = (function(Wreqr){
  "use strict";

  return Wreqr.Handlers.extend({
    // default storage type
    storageType: Wreqr.CommandStorage,

    constructor: function(options){
      this.options = options || {};

      this._initializeStorage(this.options);
      this.on("handler:add", this._executeCommands, this);

      var args = Array.prototype.slice.call(arguments);
      Wreqr.Handlers.prototype.constructor.apply(this, args);
    },

    // Execute a named command with the supplied args
    execute: function(name, args){
      name = arguments[0];
      args = Array.prototype.slice.call(arguments, 1);

      if (this.hasHandler(name)){
        this.getHandler(name).apply(this, args);
      } else {
        this.storage.addCommand(name, args);
      }

    },

    // Internal method to handle bulk execution of stored commands
    _executeCommands: function(name, handler, context){
      var command = this.storage.getCommands(name);

      // loop through and execute all the stored command instances
      _.each(command.instances, function(args){
        handler.apply(context, args);
      });

      this.storage.clearCommands(name);
    },

    // Internal method to initialize storage either from the type's
    // `storageType` or the instance `options.storageType`.
    _initializeStorage: function(options){
      var storage;

      var StorageType = options.storageType || this.storageType;
      if (_.isFunction(StorageType)){
        storage = new StorageType();
      } else {
        storage = StorageType;
      }

      this.storage = storage;
    }
  });

})(Wreqr);

  // Wreqr.RequestResponse
// ---------------------
//
// A simple request/response implementation. Register a
// request handler, and return a response from it
Wreqr.RequestResponse = (function(Wreqr){
  "use strict";

  return Wreqr.Handlers.extend({
    request: function(){
      var name = arguments[0];
      var args = Array.prototype.slice.call(arguments, 1);

      return this.getHandler(name).apply(this, args);
    }
  });

})(Wreqr);

  // Event Aggregator
// ----------------
// A pub-sub object that can be used to decouple various parts
// of an application through event-driven architecture.

Wreqr.EventAggregator = (function(Backbone, _){
  "use strict";
  var EA = function(){};

  // Copy the `extend` function used by Backbone's classes
  EA.extend = Backbone.Model.extend;

  // Copy the basic Backbone.Events on to the event aggregator
  _.extend(EA.prototype, Backbone.Events);

  return EA;
})(Backbone, _);


  return Wreqr;
})(Backbone, Backbone.Marionette, _);

var Marionette = (function(global, Backbone, _){
  "use strict";

  // Define and export the Marionette namespace
  var Marionette = {};
  Backbone.Marionette = Marionette;

  // Get the DOM manipulator for later use
  Marionette.$ = Backbone.$;

// Helpers
// -------

// For slicing `arguments` in functions
var slice = Array.prototype.slice;

function throwError(message, name) {
  var error = new Error(message);
  error.name = name || 'Error';
  throw error;
}

// Marionette.extend
// -----------------

// Borrow the Backbone `extend` method so we can use it as needed
Marionette.extend = Backbone.Model.extend;

// Marionette.getOption
// --------------------

// Retrieve an object, function or other value from a target
// object or its `options`, with `options` taking precedence.
Marionette.getOption = function(target, optionName){
  if (!target || !optionName){ return; }
  var value;

  if (target.options && (optionName in target.options) && (target.options[optionName] !== undefined)){
    value = target.options[optionName];
  } else {
    value = target[optionName];
  }

  return value;
};

// Marionette.normalizeMethods
// ----------------------

// Pass in a mapping of events => functions or function names
// and return a mapping of events => functions
Marionette.normalizeMethods = function(hash) {
  var normalizedHash = {}, method;
  _.each(hash, function(fn, name) {
    method = fn;
    if (!_.isFunction(method)) {
      method = this[method];
    }
    if (!method) {
      return;
    }
    normalizedHash[name] = method;
  }, this);
  return normalizedHash;
};

// Trigger an event and/or a corresponding method name. Examples:
//
// `this.triggerMethod("foo")` will trigger the "foo" event and
// call the "onFoo" method.
//
// `this.triggerMethod("foo:bar")` will trigger the "foo:bar" event and
// call the "onFooBar" method.
Marionette.triggerMethod = (function(){

  // split the event name on the ":"
  var splitter = /(^|:)(\w)/gi;

  // take the event section ("section1:section2:section3")
  // and turn it in to uppercase name
  function getEventName(match, prefix, eventName) {
    return eventName.toUpperCase();
  }

  // actual triggerMethod implementation
  var triggerMethod = function(event) {
    // get the method name from the event name
    var methodName = 'on' + event.replace(splitter, getEventName);
    var method = this[methodName];

    // trigger the event, if a trigger method exists
    if(_.isFunction(this.trigger)) {
      this.trigger.apply(this, arguments);
    }

    // call the onMethodName if it exists
    if (_.isFunction(method)) {
      // pass all arguments, except the event name
      return method.apply(this, _.tail(arguments));
    }
  };

  return triggerMethod;
})();

// DOMRefresh
// ----------
//
// Monitor a view's state, and after it has been rendered and shown
// in the DOM, trigger a "dom:refresh" event every time it is
// re-rendered.

Marionette.MonitorDOMRefresh = (function(documentElement){
  // track when the view has been shown in the DOM,
  // using a Marionette.Region (or by other means of triggering "show")
  function handleShow(view){
    view._isShown = true;
    triggerDOMRefresh(view);
  }

  // track when the view has been rendered
  function handleRender(view){
    view._isRendered = true;
    triggerDOMRefresh(view);
  }

  // Trigger the "dom:refresh" event and corresponding "onDomRefresh" method
  function triggerDOMRefresh(view){
    if (view._isShown && view._isRendered && isInDOM(view)){
      if (_.isFunction(view.triggerMethod)){
        view.triggerMethod("dom:refresh");
      }
    }
  }

  function isInDOM(view) {
    return documentElement.contains(view.el);
  }

  // Export public API
  return function(view){
    view.listenTo(view, "show", function(){
      handleShow(view);
    });

    view.listenTo(view, "render", function(){
      handleRender(view);
    });
  };
})(document.documentElement);


// Marionette.bindEntityEvents & unbindEntityEvents
// ---------------------------
//
// These methods are used to bind/unbind a backbone "entity" (collection/model)
// to methods on a target object.
//
// The first parameter, `target`, must have a `listenTo` method from the
// EventBinder object.
//
// The second parameter is the entity (Backbone.Model or Backbone.Collection)
// to bind the events from.
//
// The third parameter is a hash of { "event:name": "eventHandler" }
// configuration. Multiple handlers can be separated by a space. A
// function can be supplied instead of a string handler name.

(function(Marionette){
  "use strict";

  // Bind the event to handlers specified as a string of
  // handler names on the target object
  function bindFromStrings(target, entity, evt, methods){
    var methodNames = methods.split(/\s+/);

    _.each(methodNames,function(methodName) {

      var method = target[methodName];
      if(!method) {
        throwError("Method '"+ methodName +"' was configured as an event handler, but does not exist.");
      }

      target.listenTo(entity, evt, method);
    });
  }

  // Bind the event to a supplied callback function
  function bindToFunction(target, entity, evt, method){
      target.listenTo(entity, evt, method);
  }

  // Bind the event to handlers specified as a string of
  // handler names on the target object
  function unbindFromStrings(target, entity, evt, methods){
    var methodNames = methods.split(/\s+/);

    _.each(methodNames,function(methodName) {
      var method = target[methodName];
      target.stopListening(entity, evt, method);
    });
  }

  // Bind the event to a supplied callback function
  function unbindToFunction(target, entity, evt, method){
      target.stopListening(entity, evt, method);
  }


  // generic looping function
  function iterateEvents(target, entity, bindings, functionCallback, stringCallback){
    if (!entity || !bindings) { return; }

    // allow the bindings to be a function
    if (_.isFunction(bindings)){
      bindings = bindings.call(target);
    }

    // iterate the bindings and bind them
    _.each(bindings, function(methods, evt){

      // allow for a function as the handler,
      // or a list of event names as a string
      if (_.isFunction(methods)){
        functionCallback(target, entity, evt, methods);
      } else {
        stringCallback(target, entity, evt, methods);
      }

    });
  }

  // Export Public API
  Marionette.bindEntityEvents = function(target, entity, bindings){
    iterateEvents(target, entity, bindings, bindToFunction, bindFromStrings);
  };

  Marionette.unbindEntityEvents = function(target, entity, bindings){
    iterateEvents(target, entity, bindings, unbindToFunction, unbindFromStrings);
  };

})(Marionette);


// Callbacks
// ---------

// A simple way of managing a collection of callbacks
// and executing them at a later point in time, using jQuery's
// `Deferred` object.
Marionette.Callbacks = function(){
  this._deferred = Marionette.$.Deferred();
  this._callbacks = [];
};

_.extend(Marionette.Callbacks.prototype, {

  // Add a callback to be executed. Callbacks added here are
  // guaranteed to execute, even if they are added after the
  // `run` method is called.
  add: function(callback, contextOverride){
    this._callbacks.push({cb: callback, ctx: contextOverride});

    this._deferred.done(function(context, options){
      if (contextOverride){ context = contextOverride; }
      callback.call(context, options);
    });
  },

  // Run all registered callbacks with the context specified.
  // Additional callbacks can be added after this has been run
  // and they will still be executed.
  run: function(options, context){
    this._deferred.resolve(context, options);
  },

  // Resets the list of callbacks to be run, allowing the same list
  // to be run multiple times - whenever the `run` method is called.
  reset: function(){
    var callbacks = this._callbacks;
    this._deferred = Marionette.$.Deferred();
    this._callbacks = [];

    _.each(callbacks, function(cb){
      this.add(cb.cb, cb.ctx);
    }, this);
  }
});


// Marionette Controller
// ---------------------
//
// A multi-purpose object to use as a controller for
// modules and routers, and as a mediator for workflow
// and coordination of other objects, views, and more.
Marionette.Controller = function(options){
  this.triggerMethod = Marionette.triggerMethod;
  this.options = options || {};

  if (_.isFunction(this.initialize)){
    this.initialize(this.options);
  }
};

Marionette.Controller.extend = Marionette.extend;

// Controller Methods
// --------------

// Ensure it can trigger events with Backbone.Events
_.extend(Marionette.Controller.prototype, Backbone.Events, {
  close: function(){
    this.stopListening();
    this.triggerMethod("close");
    this.unbind();
  }
});

// Region
// ------
//
// Manage the visual regions of your composite application. See
// http://lostechies.com/derickbailey/2011/12/12/composite-js-apps-regions-and-region-managers/

Marionette.Region = function(options){
  this.options = options || {};
  this.el = Marionette.getOption(this, "el");

  if (!this.el){
    throwError("An 'el' must be specified for a region.", "NoElError");
  }

  if (this.initialize){
    var args = Array.prototype.slice.apply(arguments);
    this.initialize.apply(this, args);
  }
};


// Region Type methods
// -------------------

_.extend(Marionette.Region, {

  // Build an instance of a region by passing in a configuration object
  // and a default region type to use if none is specified in the config.
  //
  // The config object should either be a string as a jQuery DOM selector,
  // a Region type directly, or an object literal that specifies both
  // a selector and regionType:
  //
  // ```js
  // {
  //   selector: "#foo",
  //   regionType: MyCustomRegion
  // }
  // ```
  //
  buildRegion: function(regionConfig, defaultRegionType){
    var regionIsString = _.isString(regionConfig);
    var regionSelectorIsString = _.isString(regionConfig.selector);
    var regionTypeIsUndefined = _.isUndefined(regionConfig.regionType);
    var regionIsType = _.isFunction(regionConfig);

    if (!regionIsType && !regionIsString && !regionSelectorIsString) {
      throwError("Region must be specified as a Region type, a selector string or an object with selector property");
    }

    var selector, RegionType;

    // get the selector for the region

    if (regionIsString) {
      selector = regionConfig;
    }

    if (regionConfig.selector) {
      selector = regionConfig.selector;
      delete regionConfig.selector;
    }

    // get the type for the region

    if (regionIsType){
      RegionType = regionConfig;
    }

    if (!regionIsType && regionTypeIsUndefined) {
      RegionType = defaultRegionType;
    }

    if (regionConfig.regionType) {
      RegionType = regionConfig.regionType;
      delete regionConfig.regionType;
    }

    if (regionIsString || regionIsType) {
      regionConfig = {};
    }

    regionConfig.el = selector;

    // build the region instance
    var region = new RegionType(regionConfig);

    // override the `getEl` function if we have a parentEl
    // this must be overridden to ensure the selector is found
    // on the first use of the region. if we try to assign the
    // region's `el` to `parentEl.find(selector)` in the object
    // literal to build the region, the element will not be
    // guaranteed to be in the DOM already, and will cause problems
    if (regionConfig.parentEl){
      region.getEl = function(selector) {
        var parentEl = regionConfig.parentEl;
        if (_.isFunction(parentEl)){
          parentEl = parentEl();
        }
        return parentEl.find(selector);
      };
    }

    return region;
  }

});

// Region Instance Methods
// -----------------------

_.extend(Marionette.Region.prototype, Backbone.Events, {

  // Displays a backbone view instance inside of the region.
  // Handles calling the `render` method for you. Reads content
  // directly from the `el` attribute. Also calls an optional
  // `onShow` and `close` method on your view, just after showing
  // or just before closing the view, respectively.
  show: function(view){
    this.ensureEl();

    var isViewClosed = view.isClosed || _.isUndefined(view.$el);
    var isDifferentView = view !== this.currentView;

    if (isDifferentView) {
      this.close();
    }

    view.render();

    if (isDifferentView || isViewClosed) {
      this.open(view);
    }

    this.currentView = view;

    Marionette.triggerMethod.call(this, "show", view);
    Marionette.triggerMethod.call(view, "show");
  },

  ensureEl: function(){
    if (!this.$el || this.$el.length === 0){
      this.$el = this.getEl(this.el);
    }
  },

  // Override this method to change how the region finds the
  // DOM element that it manages. Return a jQuery selector object.
  getEl: function(selector){
    return Marionette.$(selector);
  },

  // Override this method to change how the new view is
  // appended to the `$el` that the region is managing
  open: function(view){
    this.$el.empty().append(view.el);
  },

  // Close the current view, if there is one. If there is no
  // current view, it does nothing and returns immediately.
  close: function(){
    var view = this.currentView;
    if (!view || view.isClosed){ return; }

    // call 'close' or 'remove', depending on which is found
    if (view.close) { view.close(); }
    else if (view.remove) { view.remove(); }

    Marionette.triggerMethod.call(this, "close", view);

    delete this.currentView;
  },

  // Attach an existing view to the region. This
  // will not call `render` or `onShow` for the new view,
  // and will not replace the current HTML for the `el`
  // of the region.
  attachView: function(view){
    this.currentView = view;
  },

  // Reset the region by closing any existing view and
  // clearing out the cached `$el`. The next time a view
  // is shown via this region, the region will re-query the
  // DOM for the region's `el`.
  reset: function(){
    this.close();
    delete this.$el;
  }
});

// Copy the `extend` function used by Backbone's classes
Marionette.Region.extend = Marionette.extend;

// Marionette.RegionManager
// ------------------------
//
// Manage one or more related `Marionette.Region` objects.
Marionette.RegionManager = (function(Marionette){

  var RegionManager = Marionette.Controller.extend({
    constructor: function(options){
      this._regions = {};
      Marionette.Controller.prototype.constructor.call(this, options);
    },

    // Add multiple regions using an object literal, where
    // each key becomes the region name, and each value is
    // the region definition.
    addRegions: function(regionDefinitions, defaults){
      var regions = {};

      _.each(regionDefinitions, function(definition, name){
        if (_.isString(definition)){
          definition = { selector: definition };
        }

        if (definition.selector){
          definition = _.defaults({}, definition, defaults);
        }

        var region = this.addRegion(name, definition);
        regions[name] = region;
      }, this);

      return regions;
    },

    // Add an individual region to the region manager,
    // and return the region instance
    addRegion: function(name, definition){
      var region;

      var isObject = _.isObject(definition);
      var isString = _.isString(definition);
      var hasSelector = !!definition.selector;

      if (isString || (isObject && hasSelector)){
        region = Marionette.Region.buildRegion(definition, Marionette.Region);
      } else if (_.isFunction(definition)){
        region = Marionette.Region.buildRegion(definition, Marionette.Region);
      } else {
        region = definition;
      }

      this._store(name, region);
      this.triggerMethod("region:add", name, region);
      return region;
    },

    // Get a region by name
    get: function(name){
      return this._regions[name];
    },

    // Remove a region by name
    removeRegion: function(name){
      var region = this._regions[name];
      this._remove(name, region);
    },

    // Close all regions in the region manager, and
    // remove them
    removeRegions: function(){
      _.each(this._regions, function(region, name){
        this._remove(name, region);
      }, this);
    },

    // Close all regions in the region manager, but
    // leave them attached
    closeRegions: function(){
      _.each(this._regions, function(region, name){
        region.close();
      }, this);
    },

    // Close all regions and shut down the region
    // manager entirely
    close: function(){
      this.removeRegions();
      Marionette.Controller.prototype.close.apply(this, arguments);
    },

    // internal method to store regions
    _store: function(name, region){
      this._regions[name] = region;
      this._setLength();
    },

    // internal method to remove a region
    _remove: function(name, region){
      region.close();
      delete this._regions[name];
      this._setLength();
      this.triggerMethod("region:remove", name, region);
    },

    // set the number of regions current held
    _setLength: function(){
      this.length = _.size(this._regions);
    }

  });

  // Borrowing this code from Backbone.Collection:
  // http://backbonejs.org/docs/backbone.html#section-106
  //
  // Mix in methods from Underscore, for iteration, and other
  // collection related features.
  var methods = ['forEach', 'each', 'map', 'find', 'detect', 'filter',
    'select', 'reject', 'every', 'all', 'some', 'any', 'include',
    'contains', 'invoke', 'toArray', 'first', 'initial', 'rest',
    'last', 'without', 'isEmpty', 'pluck'];

  _.each(methods, function(method) {
    RegionManager.prototype[method] = function() {
      var regions = _.values(this._regions);
      var args = [regions].concat(_.toArray(arguments));
      return _[method].apply(_, args);
    };
  });

  return RegionManager;
})(Marionette);


// Template Cache
// --------------

// Manage templates stored in `<script>` blocks,
// caching them for faster access.
Marionette.TemplateCache = function(templateId){
  this.templateId = templateId;
};

// TemplateCache object-level methods. Manage the template
// caches from these method calls instead of creating
// your own TemplateCache instances
_.extend(Marionette.TemplateCache, {
  templateCaches: {},

  // Get the specified template by id. Either
  // retrieves the cached version, or loads it
  // from the DOM.
  get: function(templateId){
    var cachedTemplate = this.templateCaches[templateId];

    if (!cachedTemplate){
      cachedTemplate = new Marionette.TemplateCache(templateId);
      this.templateCaches[templateId] = cachedTemplate;
    }

    return cachedTemplate.load();
  },

  // Clear templates from the cache. If no arguments
  // are specified, clears all templates:
  // `clear()`
  //
  // If arguments are specified, clears each of the
  // specified templates from the cache:
  // `clear("#t1", "#t2", "...")`
  clear: function(){
    var i;
    var args = slice.call(arguments);
    var length = args.length;

    if (length > 0){
      for(i=0; i<length; i++){
        delete this.templateCaches[args[i]];
      }
    } else {
      this.templateCaches = {};
    }
  }
});

// TemplateCache instance methods, allowing each
// template cache object to manage its own state
// and know whether or not it has been loaded
_.extend(Marionette.TemplateCache.prototype, {

  // Internal method to load the template
  load: function(){
    // Guard clause to prevent loading this template more than once
    if (this.compiledTemplate){
      return this.compiledTemplate;
    }

    // Load the template and compile it
    var template = this.loadTemplate(this.templateId);
    this.compiledTemplate = this.compileTemplate(template);

    return this.compiledTemplate;
  },

  // Load a template from the DOM, by default. Override
  // this method to provide your own template retrieval
  // For asynchronous loading with AMD/RequireJS, consider
  // using a template-loader plugin as described here:
  // https://github.com/marionettejs/backbone.marionette/wiki/Using-marionette-with-requirejs
  loadTemplate: function(templateId){
    var template = Marionette.$(templateId).html();

    if (!template || template.length === 0){
      throwError("Could not find template: '" + templateId + "'", "NoTemplateError");
    }

    return template;
  },

  // Pre-compile the template before caching it. Override
  // this method if you do not need to pre-compile a template
  // (JST / RequireJS for example) or if you want to change
  // the template engine used (Handebars, etc).
  compileTemplate: function(rawTemplate){
    return _.template(rawTemplate);
  }
});


// Renderer
// --------

// Render a template with data by passing in the template
// selector and the data to render.
Marionette.Renderer = {

  // Render a template with data. The `template` parameter is
  // passed to the `TemplateCache` object to retrieve the
  // template function. Override this method to provide your own
  // custom rendering and template handling for all of Marionette.
  render: function(template, data){

    if (!template) {
      throwError("Cannot render the template since it's false, null or undefined.", "TemplateNotFoundError");
    }

    var templateFunc;
    if (typeof template === "function"){
      templateFunc = template;
    } else {
      templateFunc = Marionette.TemplateCache.get(template);
    }

    return templateFunc(data);
  }
};



// Marionette.View
// ---------------

// The core view type that other Marionette views extend from.
Marionette.View = Backbone.View.extend({

  constructor: function(options){
    _.bindAll(this, "render");

    // this exposes view options to the view initializer
    // this is a backfill since backbone removed the assignment
    // of this.options
    // at some point however this may be removed
    this.options = _.extend({}, _.result(this, 'options'), _.isFunction(options) ? options.call(this) : options);

    // parses out the @ui DSL for events
    this.events = this.normalizeUIKeys(_.result(this, 'events'));
    Backbone.View.prototype.constructor.apply(this, arguments);

    Marionette.MonitorDOMRefresh(this);
    this.listenTo(this, "show", this.onShowCalled);
  },

  // import the "triggerMethod" to trigger events with corresponding
  // methods if the method exists
  triggerMethod: Marionette.triggerMethod,

  // Imports the "normalizeMethods" to transform hashes of
  // events=>function references/names to a hash of events=>function references
  normalizeMethods: Marionette.normalizeMethods,

  // Get the template for this view
  // instance. You can set a `template` attribute in the view
  // definition or pass a `template: "whatever"` parameter in
  // to the constructor options.
  getTemplate: function(){
    return Marionette.getOption(this, "template");
  },

  // Mix in template helper methods. Looks for a
  // `templateHelpers` attribute, which can either be an
  // object literal, or a function that returns an object
  // literal. All methods and attributes from this object
  // are copies to the object passed in.
  mixinTemplateHelpers: function(target){
    target = target || {};
    var templateHelpers = Marionette.getOption(this, "templateHelpers");
    if (_.isFunction(templateHelpers)){
      templateHelpers = templateHelpers.call(this);
    }
    return _.extend(target, templateHelpers);
  },

  // allows for the use of the @ui. syntax within
  // a given key for triggers and events
  // swaps the @ui with the associated selector
  normalizeUIKeys: function(hash) {
    var _this = this;
    if (typeof(hash) === "undefined") {
      return;
    }

    _.each(_.keys(hash), function(v) {
      var pattern = /@ui.[a-zA-Z_$0-9]*/g;
      if (v.match(pattern)) {
        hash[v.replace(pattern, function(r) {
          return _.result(_this, "ui")[r.slice(4)];
        })] = hash[v];
        delete hash[v];
      }
    });

    return hash;
  },

  // Configure `triggers` to forward DOM events to view
  // events. `triggers: {"click .foo": "do:foo"}`
  configureTriggers: function(){
    if (!this.triggers) { return; }

    var triggerEvents = {};

    // Allow `triggers` to be configured as a function
    var triggers = this.normalizeUIKeys(_.result(this, "triggers"));

    // Configure the triggers, prevent default
    // action and stop propagation of DOM events
    _.each(triggers, function(value, key){

      var hasOptions = _.isObject(value);
      var eventName = hasOptions ? value.event : value;

      // build the event handler function for the DOM event
      triggerEvents[key] = function(e){

        // stop the event in its tracks
        if (e) {
          var prevent = e.preventDefault;
          var stop = e.stopPropagation;

          var shouldPrevent = hasOptions ? value.preventDefault : prevent;
          var shouldStop = hasOptions ? value.stopPropagation : stop;

          if (shouldPrevent && prevent) { prevent.apply(e); }
          if (shouldStop && stop) { stop.apply(e); }
        }

        // build the args for the event
        var args = {
          view: this,
          model: this.model,
          collection: this.collection
        };

        // trigger the event
        this.triggerMethod(eventName, args);
      };

    }, this);

    return triggerEvents;
  },

  // Overriding Backbone.View's delegateEvents to handle
  // the `triggers`, `modelEvents`, and `collectionEvents` configuration
  delegateEvents: function(events){
    this._delegateDOMEvents(events);
    Marionette.bindEntityEvents(this, this.model, Marionette.getOption(this, "modelEvents"));
    Marionette.bindEntityEvents(this, this.collection, Marionette.getOption(this, "collectionEvents"));
  },

  // internal method to delegate DOM events and triggers
  _delegateDOMEvents: function(events){
    events = events || this.events;
    if (_.isFunction(events)){ events = events.call(this); }

    var combinedEvents = {};
    var triggers = this.configureTriggers();
    _.extend(combinedEvents, events, triggers);

    Backbone.View.prototype.delegateEvents.call(this, combinedEvents);
  },

  // Overriding Backbone.View's undelegateEvents to handle unbinding
  // the `triggers`, `modelEvents`, and `collectionEvents` config
  undelegateEvents: function(){
    var args = Array.prototype.slice.call(arguments);
    Backbone.View.prototype.undelegateEvents.apply(this, args);

    Marionette.unbindEntityEvents(this, this.model, Marionette.getOption(this, "modelEvents"));
    Marionette.unbindEntityEvents(this, this.collection, Marionette.getOption(this, "collectionEvents"));
  },

  // Internal method, handles the `show` event.
  onShowCalled: function(){},

  // Default `close` implementation, for removing a view from the
  // DOM and unbinding it. Regions will call this method
  // for you. You can specify an `onClose` method in your view to
  // add custom code that is called after the view is closed.
  close: function(){
    if (this.isClosed) { return; }

    // allow the close to be stopped by returning `false`
    // from the `onBeforeClose` method
    var shouldClose = this.triggerMethod("before:close");
    if (shouldClose === false){
      return;
    }

    // mark as closed before doing the actual close, to
    // prevent infinite loops within "close" event handlers
    // that are trying to close other views
    this.isClosed = true;
    this.triggerMethod("close");

    // unbind UI elements
    this.unbindUIElements();

    // remove the view from the DOM
    this.remove();
  },

  // This method binds the elements specified in the "ui" hash inside the view's code with
  // the associated jQuery selectors.
  bindUIElements: function(){
    if (!this.ui) { return; }

    // store the ui hash in _uiBindings so they can be reset later
    // and so re-rendering the view will be able to find the bindings
    if (!this._uiBindings){
      this._uiBindings = this.ui;
    }

    // get the bindings result, as a function or otherwise
    var bindings = _.result(this, "_uiBindings");

    // empty the ui so we don't have anything to start with
    this.ui = {};

    // bind each of the selectors
    _.each(_.keys(bindings), function(key) {
      var selector = bindings[key];
      this.ui[key] = this.$(selector);
    }, this);
  },

  // This method unbinds the elements specified in the "ui" hash
  unbindUIElements: function(){
    if (!this.ui || !this._uiBindings){ return; }

    // delete all of the existing ui bindings
    _.each(this.ui, function($el, name){
      delete this.ui[name];
    }, this);

    // reset the ui element to the original bindings configuration
    this.ui = this._uiBindings;
    delete this._uiBindings;
  }
});

// Item View
// ---------

// A single item view implementation that contains code for rendering
// with underscore.js templates, serializing the view's model or collection,
// and calling several methods on extended views, such as `onRender`.
Marionette.ItemView = Marionette.View.extend({

  // Setting up the inheritance chain which allows changes to
  // Marionette.View.prototype.constructor which allows overriding
  constructor: function(){
    Marionette.View.prototype.constructor.apply(this, arguments);
  },

  // Serialize the model or collection for the view. If a model is
  // found, `.toJSON()` is called. If a collection is found, `.toJSON()`
  // is also called, but is used to populate an `items` array in the
  // resulting data. If both are found, defaults to the model.
  // You can override the `serializeData` method in your own view
  // definition, to provide custom serialization for your view's data.
  serializeData: function(){
    var data = {};

    if (this.model) {
      data = this.model.toJSON();
    }
    else if (this.collection) {
      data = { items: this.collection.toJSON() };
    }

    return data;
  },

  // Render the view, defaulting to underscore.js templates.
  // You can override this in your view definition to provide
  // a very specific rendering for your view. In general, though,
  // you should override the `Marionette.Renderer` object to
  // change how Marionette renders views.
  render: function(){
    this.isClosed = false;

    this.triggerMethod("before:render", this);
    this.triggerMethod("item:before:render", this);

    var data = this.serializeData();
    data = this.mixinTemplateHelpers(data);

    var template = this.getTemplate();
    var html = Marionette.Renderer.render(template, data);

    this.$el.html(html);
    this.bindUIElements();

    this.triggerMethod("render", this);
    this.triggerMethod("item:rendered", this);

    return this;
  },

  // Override the default close event to add a few
  // more events that are triggered.
  close: function(){
    if (this.isClosed){ return; }

    this.triggerMethod('item:before:close');

    Marionette.View.prototype.close.apply(this, arguments);

    this.triggerMethod('item:closed');
  }
});

// Collection View
// ---------------

// A view that iterates over a Backbone.Collection
// and renders an individual ItemView for each model.
Marionette.CollectionView = Marionette.View.extend({
  // used as the prefix for item view events
  // that are forwarded through the collectionview
  itemViewEventPrefix: "itemview",

  // constructor
  constructor: function(options){
    this._initChildViewStorage();

    Marionette.View.prototype.constructor.apply(this, arguments);

    this._initialEvents();
    this.initRenderBuffer();
  },

  // Instead of inserting elements one by one into the page,
  // it's much more performant to insert elements into a document
  // fragment and then insert that document fragment into the page
  initRenderBuffer: function() {
    this.elBuffer = document.createDocumentFragment();
    this._bufferedChildren = [];
  },

  startBuffering: function() {
    this.initRenderBuffer();
    this.isBuffering = true;
  },

  endBuffering: function() {
    this.isBuffering = false;
    this.appendBuffer(this, this.elBuffer);
    this._triggerShowBufferedChildren();
    this.initRenderBuffer();
  },

  _triggerShowBufferedChildren: function () {
    if (this._isShown) {
      _.each(this._bufferedChildren, function (child) {
        Marionette.triggerMethod.call(child, "show");
      });
      this._bufferedChildren = [];
    }
  },

  // Configured the initial events that the collection view
  // binds to.
  _initialEvents: function(){
    if (this.collection){
      this.listenTo(this.collection, "add", this.addChildView);
      this.listenTo(this.collection, "remove", this.removeItemView);
      this.listenTo(this.collection, "reset", this.render);
    }
  },

  // Handle a child item added to the collection
  addChildView: function(item, collection, options){
    this.closeEmptyView();
    var ItemView = this.getItemView(item);
    var index = this.collection.indexOf(item);
    this.addItemView(item, ItemView, index);
  },

  // Override from `Marionette.View` to guarantee the `onShow` method
  // of child views is called.
  onShowCalled: function(){
    this.children.each(function(child){
      Marionette.triggerMethod.call(child, "show");
    });
  },

  // Internal method to trigger the before render callbacks
  // and events
  triggerBeforeRender: function(){
    this.triggerMethod("before:render", this);
    this.triggerMethod("collection:before:render", this);
  },

  // Internal method to trigger the rendered callbacks and
  // events
  triggerRendered: function(){
    this.triggerMethod("render", this);
    this.triggerMethod("collection:rendered", this);
  },

  // Render the collection of items. Override this method to
  // provide your own implementation of a render function for
  // the collection view.
  render: function(){
    this.isClosed = false;
    this.triggerBeforeRender();
    this._renderChildren();
    this.triggerRendered();
    return this;
  },

  // Internal method. Separated so that CompositeView can have
  // more control over events being triggered, around the rendering
  // process
  _renderChildren: function(){
    this.startBuffering();

    this.closeEmptyView();
    this.closeChildren();

    if (!this.isEmpty(this.collection)) {
      this.showCollection();
    } else {
      this.showEmptyView();
    }

    this.endBuffering();
  },

  // Internal method to loop through each item in the
  // collection view and show it
  showCollection: function(){
    var ItemView;
    this.collection.each(function(item, index){
      ItemView = this.getItemView(item);
      this.addItemView(item, ItemView, index);
    }, this);
  },

  // Internal method to show an empty view in place of
  // a collection of item views, when the collection is
  // empty
  showEmptyView: function(){
    var EmptyView = this.getEmptyView();

    if (EmptyView && !this._showingEmptyView){
      this._showingEmptyView = true;
      var model = new Backbone.Model();
      this.addItemView(model, EmptyView, 0);
    }
  },

  // Internal method to close an existing emptyView instance
  // if one exists. Called when a collection view has been
  // rendered empty, and then an item is added to the collection.
  closeEmptyView: function(){
    if (this._showingEmptyView){
      this.closeChildren();
      delete this._showingEmptyView;
    }
  },

  // Retrieve the empty view type
  getEmptyView: function(){
    return Marionette.getOption(this, "emptyView");
  },

  // Retrieve the itemView type, either from `this.options.itemView`
  // or from the `itemView` in the object definition. The "options"
  // takes precedence.
  getItemView: function(item){
    var itemView = Marionette.getOption(this, "itemView");

    if (!itemView){
      throwError("An `itemView` must be specified", "NoItemViewError");
    }

    return itemView;
  },

  // Render the child item's view and add it to the
  // HTML for the collection view.
  addItemView: function(item, ItemView, index){
    // get the itemViewOptions if any were specified
    var itemViewOptions = Marionette.getOption(this, "itemViewOptions");
    if (_.isFunction(itemViewOptions)){
      itemViewOptions = itemViewOptions.call(this, item, index);
    }

    // build the view
    var view = this.buildItemView(item, ItemView, itemViewOptions);

    // set up the child view event forwarding
    this.addChildViewEventForwarding(view);

    // this view is about to be added
    this.triggerMethod("before:item:added", view);

    // Store the child view itself so we can properly
    // remove and/or close it later
    this.children.add(view);

    // Render it and show it
    this.renderItemView(view, index);

    // call the "show" method if the collection view
    // has already been shown
    if (this._isShown && !this.isBuffering){
      Marionette.triggerMethod.call(view, "show");
    }

    // this view was added
    this.triggerMethod("after:item:added", view);

    return view;
  },

  // Set up the child view event forwarding. Uses an "itemview:"
  // prefix in front of all forwarded events.
  addChildViewEventForwarding: function(view){
    var prefix = Marionette.getOption(this, "itemViewEventPrefix");

    // Forward all child item view events through the parent,
    // prepending "itemview:" to the event name
    this.listenTo(view, "all", function(){
      var args = slice.call(arguments);
      var rootEvent = args[0];
      var itemEvents = this.normalizeMethods(this.getItemEvents());

      args[0] = prefix + ":" + rootEvent;
      args.splice(1, 0, view);

      // call collectionView itemEvent if defined
      if (typeof itemEvents !== "undefined" && _.isFunction(itemEvents[rootEvent])) {
        itemEvents[rootEvent].apply(this, args);
      }

      Marionette.triggerMethod.apply(this, args);
    }, this);
  },

  // returns the value of itemEvents depending on if a function
  getItemEvents: function() {
    if (_.isFunction(this.itemEvents)) {
      return this.itemEvents.call(this);
    }

    return this.itemEvents;
  },

  // render the item view
  renderItemView: function(view, index) {
    view.render();
    this.appendHtml(this, view, index);
  },

  // Build an `itemView` for every model in the collection.
  buildItemView: function(item, ItemViewType, itemViewOptions){
    var options = _.extend({model: item}, itemViewOptions);
    return new ItemViewType(options);
  },

  // get the child view by item it holds, and remove it
  removeItemView: function(item){
    var view = this.children.findByModel(item);
    this.removeChildView(view);
    this.checkEmpty();
  },

  // Remove the child view and close it
  removeChildView: function(view){

    // shut down the child view properly,
    // including events that the collection has from it
    if (view){
      this.stopListening(view);

      // call 'close' or 'remove', depending on which is found
      if (view.close) { view.close(); }
      else if (view.remove) { view.remove(); }

      this.children.remove(view);
    }

    this.triggerMethod("item:removed", view);
  },

  // helper to check if the collection is empty
  isEmpty: function(collection){
    // check if we're empty now
    return !this.collection || this.collection.length === 0;
  },

  // If empty, show the empty view
  checkEmpty: function (){
    if (this.isEmpty(this.collection)){
      this.showEmptyView();
    }
  },

  // You might need to override this if you've overridden appendHtml
  appendBuffer: function(collectionView, buffer) {
    collectionView.$el.append(buffer);
  },

  // Append the HTML to the collection's `el`.
  // Override this method to do something other
  // than `.append`.
  appendHtml: function(collectionView, itemView, index){
    if (collectionView.isBuffering) {
      // buffering happens on reset events and initial renders
      // in order to reduce the number of inserts into the
      // document, which are expensive.
      collectionView.elBuffer.appendChild(itemView.el);
      collectionView._bufferedChildren.push(itemView);
    }
    else {
      // If we've already rendered the main collection, just
      // append the new items directly into the element.
      collectionView.$el.append(itemView.el);
    }
  },

  // Internal method to set up the `children` object for
  // storing all of the child views
  _initChildViewStorage: function(){
    this.children = new Backbone.ChildViewContainer();
  },

  // Handle cleanup and other closing needs for
  // the collection of views.
  close: function(){
    if (this.isClosed){ return; }

    this.triggerMethod("collection:before:close");
    this.closeChildren();
    this.triggerMethod("collection:closed");

    Marionette.View.prototype.close.apply(this, arguments);
  },

  // Close the child views that this collection view
  // is holding on to, if any
  closeChildren: function(){
    this.children.each(function(child){
      this.removeChildView(child);
    }, this);
    this.checkEmpty();
  }
});


// Composite View
// --------------

// Used for rendering a branch-leaf, hierarchical structure.
// Extends directly from CollectionView and also renders an
// an item view as `modelView`, for the top leaf
Marionette.CompositeView = Marionette.CollectionView.extend({

  // Setting up the inheritance chain which allows changes to
  // Marionette.CollectionView.prototype.constructor which allows overriding
  constructor: function(){
    Marionette.CollectionView.prototype.constructor.apply(this, arguments);
  },

  // Configured the initial events that the composite view
  // binds to. Override this method to prevent the initial
  // events, or to add your own initial events.
  _initialEvents: function(){

    // Bind only after composite view is rendered to avoid adding child views
    // to nonexistent itemViewContainer
    this.once('render', function () {
      if (this.collection){
        this.listenTo(this.collection, "add", this.addChildView);
        this.listenTo(this.collection, "remove", this.removeItemView);
        this.listenTo(this.collection, "reset", this._renderChildren);
      }
    });

  },

  // Retrieve the `itemView` to be used when rendering each of
  // the items in the collection. The default is to return
  // `this.itemView` or Marionette.CompositeView if no `itemView`
  // has been defined
  getItemView: function(item){
    var itemView = Marionette.getOption(this, "itemView") || this.constructor;

    if (!itemView){
      throwError("An `itemView` must be specified", "NoItemViewError");
    }

    return itemView;
  },

  // Serialize the collection for the view.
  // You can override the `serializeData` method in your own view
  // definition, to provide custom serialization for your view's data.
  serializeData: function(){
    var data = {};

    if (this.model){
      data = this.model.toJSON();
    }

    return data;
  },

  // Renders the model once, and the collection once. Calling
  // this again will tell the model's view to re-render itself
  // but the collection will not re-render.
  render: function(){
    this.isRendered = true;
    this.isClosed = false;
    this.resetItemViewContainer();

    this.triggerBeforeRender();
    var html = this.renderModel();
    this.$el.html(html);
    // the ui bindings is done here and not at the end of render since they
    // will not be available until after the model is rendered, but should be
    // available before the collection is rendered.
    this.bindUIElements();
    this.triggerMethod("composite:model:rendered");

    this._renderChildren();

    this.triggerMethod("composite:rendered");
    this.triggerRendered();
    return this;
  },

  _renderChildren: function(){
    if (this.isRendered){
      this.triggerMethod("composite:collection:before:render");
      Marionette.CollectionView.prototype._renderChildren.call(this);
      this.triggerMethod("composite:collection:rendered");
    }
  },

  // Render an individual model, if we have one, as
  // part of a composite view (branch / leaf). For example:
  // a treeview.
  renderModel: function(){
    var data = {};
    data = this.serializeData();
    data = this.mixinTemplateHelpers(data);

    var template = this.getTemplate();
    return Marionette.Renderer.render(template, data);
  },


  // You might need to override this if you've overridden appendHtml
  appendBuffer: function(compositeView, buffer) {
    var $container = this.getItemViewContainer(compositeView);
    $container.append(buffer);
  },

  // Appends the `el` of itemView instances to the specified
  // `itemViewContainer` (a jQuery selector). Override this method to
  // provide custom logic of how the child item view instances have their
  // HTML appended to the composite view instance.
  appendHtml: function(compositeView, itemView, index){
    if (compositeView.isBuffering) {
      compositeView.elBuffer.appendChild(itemView.el);
      compositeView._bufferedChildren.push(itemView);
    }
    else {
      // If we've already rendered the main collection, just
      // append the new items directly into the element.
      var $container = this.getItemViewContainer(compositeView);
      $container.append(itemView.el);
    }
  },


  // Internal method to ensure an `$itemViewContainer` exists, for the
  // `appendHtml` method to use.
  getItemViewContainer: function(containerView){
    if ("$itemViewContainer" in containerView){
      return containerView.$itemViewContainer;
    }

    var container;
    var itemViewContainer = Marionette.getOption(containerView, "itemViewContainer");
    if (itemViewContainer){

      var selector = _.isFunction(itemViewContainer) ? itemViewContainer.call(this) : itemViewContainer;
      container = containerView.$(selector);
      if (container.length <= 0) {
        throwError("The specified `itemViewContainer` was not found: " + containerView.itemViewContainer, "ItemViewContainerMissingError");
      }

    } else {
      container = containerView.$el;
    }

    containerView.$itemViewContainer = container;
    return container;
  },

  // Internal method to reset the `$itemViewContainer` on render
  resetItemViewContainer: function(){
    if (this.$itemViewContainer){
      delete this.$itemViewContainer;
    }
  }
});


// Layout
// ------

// Used for managing application layouts, nested layouts and
// multiple regions within an application or sub-application.
//
// A specialized view type that renders an area of HTML and then
// attaches `Region` instances to the specified `regions`.
// Used for composite view management and sub-application areas.
Marionette.Layout = Marionette.ItemView.extend({
  regionType: Marionette.Region,

  // Ensure the regions are available when the `initialize` method
  // is called.
  constructor: function (options) {
    options = options || {};

    this._firstRender = true;
    this._initializeRegions(options);

    Marionette.ItemView.prototype.constructor.call(this, options);
  },

  // Layout's render will use the existing region objects the
  // first time it is called. Subsequent calls will close the
  // views that the regions are showing and then reset the `el`
  // for the regions to the newly rendered DOM elements.
  render: function(){

    if (this.isClosed){
      // a previously closed layout means we need to
      // completely re-initialize the regions
      this._initializeRegions();
    }
    if (this._firstRender) {
      // if this is the first render, don't do anything to
      // reset the regions
      this._firstRender = false;
    } else if (!this.isClosed){
      // If this is not the first render call, then we need to
      // re-initializing the `el` for each region
      this._reInitializeRegions();
    }

    return Marionette.ItemView.prototype.render.apply(this, arguments);
  },

  // Handle closing regions, and then close the view itself.
  close: function () {
    if (this.isClosed){ return; }
    this.regionManager.close();
    Marionette.ItemView.prototype.close.apply(this, arguments);
  },

  // Add a single region, by name, to the layout
  addRegion: function(name, definition){
    var regions = {};
    regions[name] = definition;
    return this._buildRegions(regions)[name];
  },

  // Add multiple regions as a {name: definition, name2: def2} object literal
  addRegions: function(regions){
    this.regions = _.extend({}, this.regions, regions);
    return this._buildRegions(regions);
  },

  // Remove a single region from the Layout, by name
  removeRegion: function(name){
    delete this.regions[name];
    return this.regionManager.removeRegion(name);
  },

  // internal method to build regions
  _buildRegions: function(regions){
    var that = this;

    var defaults = {
      regionType: Marionette.getOption(this, "regionType"),
      parentEl: function(){ return that.$el; }
    };

    return this.regionManager.addRegions(regions, defaults);
  },

  // Internal method to initialize the regions that have been defined in a
  // `regions` attribute on this layout.
  _initializeRegions: function (options) {
    var regions;
    this._initRegionManager();

    if (_.isFunction(this.regions)) {
      regions = this.regions(options);
    } else {
      regions = this.regions || {};
    }

    this.addRegions(regions);
  },

  // Internal method to re-initialize all of the regions by updating the `el` that
  // they point to
  _reInitializeRegions: function(){
    this.regionManager.closeRegions();
    this.regionManager.each(function(region){
      region.reset();
    });
  },

  // Internal method to initialize the region manager
  // and all regions in it
  _initRegionManager: function(){
    this.regionManager = new Marionette.RegionManager();

    this.listenTo(this.regionManager, "region:add", function(name, region){
      this[name] = region;
      this.trigger("region:add", name, region);
    });

    this.listenTo(this.regionManager, "region:remove", function(name, region){
      delete this[name];
      this.trigger("region:remove", name, region);
    });
  }
});


// AppRouter
// ---------

// Reduce the boilerplate code of handling route events
// and then calling a single method on another object.
// Have your routers configured to call the method on
// your object, directly.
//
// Configure an AppRouter with `appRoutes`.
//
// App routers can only take one `controller` object.
// It is recommended that you divide your controller
// objects in to smaller pieces of related functionality
// and have multiple routers / controllers, instead of
// just one giant router and controller.
//
// You can also add standard routes to an AppRouter.

Marionette.AppRouter = Backbone.Router.extend({

  constructor: function(options){
    Backbone.Router.prototype.constructor.apply(this, arguments);
	
    this.options = options || {};

    var appRoutes = Marionette.getOption(this, "appRoutes");
    var controller = this._getController();
    this.processAppRoutes(controller, appRoutes);
  },

  // Similar to route method on a Backbone Router but
  // method is called on the controller
  appRoute: function(route, methodName) {
    var controller = this._getController();
    this._addAppRoute(controller, route, methodName);
  },

  // Internal method to process the `appRoutes` for the
  // router, and turn them in to routes that trigger the
  // specified method on the specified `controller`.
  processAppRoutes: function(controller, appRoutes) {
    if (!appRoutes){ return; }

    var routeNames = _.keys(appRoutes).reverse(); // Backbone requires reverted order of routes

    _.each(routeNames, function(route) {
      this._addAppRoute(controller, route, appRoutes[route]);
    }, this);
  },

  _getController: function(){
    return Marionette.getOption(this, "controller");
  },

  _addAppRoute: function(controller, route, methodName){
    var method = controller[methodName];

    if (!method) {
      throwError("Method '" + methodName + "' was not found on the controller");
    }

    this.route(route, methodName, _.bind(method, controller));
  }
});


// Application
// -----------

// Contain and manage the composite application as a whole.
// Stores and starts up `Region` objects, includes an
// event aggregator as `app.vent`
Marionette.Application = function(options){
  this._initRegionManager();
  this._initCallbacks = new Marionette.Callbacks();
  this.vent = new Backbone.Wreqr.EventAggregator();
  this.commands = new Backbone.Wreqr.Commands();
  this.reqres = new Backbone.Wreqr.RequestResponse();
  this.submodules = {};

  _.extend(this, options);

  this.triggerMethod = Marionette.triggerMethod;
};

_.extend(Marionette.Application.prototype, Backbone.Events, {
  // Command execution, facilitated by Backbone.Wreqr.Commands
  execute: function(){
    this.commands.execute.apply(this.commands, arguments);
  },

  // Request/response, facilitated by Backbone.Wreqr.RequestResponse
  request: function(){
    return this.reqres.request.apply(this.reqres, arguments);
  },

  // Add an initializer that is either run at when the `start`
  // method is called, or run immediately if added after `start`
  // has already been called.
  addInitializer: function(initializer){
    this._initCallbacks.add(initializer);
  },

  // kick off all of the application's processes.
  // initializes all of the regions that have been added
  // to the app, and runs all of the initializer functions
  start: function(options){
    this.triggerMethod("initialize:before", options);
    this._initCallbacks.run(options, this);
    this.triggerMethod("initialize:after", options);

    this.triggerMethod("start", options);
  },

  // Add regions to your app.
  // Accepts a hash of named strings or Region objects
  // addRegions({something: "#someRegion"})
  // addRegions({something: Region.extend({el: "#someRegion"}) });
  addRegions: function(regions){
    return this._regionManager.addRegions(regions);
  },

  // Close all regions in the app, without removing them
  closeRegions: function(){
    this._regionManager.closeRegions();
  },

  // Removes a region from your app, by name
  // Accepts the regions name
  // removeRegion('myRegion')
  removeRegion: function(region) {
    this._regionManager.removeRegion(region);
  },

  // Provides alternative access to regions
  // Accepts the region name
  // getRegion('main')
  getRegion: function(region) {
    return this._regionManager.get(region);
  },

  // Create a module, attached to the application
  module: function(moduleNames, moduleDefinition){

    // Overwrite the module class if the user specifies one
    var ModuleClass = Marionette.Module.getClass(moduleDefinition);

    // slice the args, and add this application object as the
    // first argument of the array
    var args = slice.call(arguments);
    args.unshift(this);

    // see the Marionette.Module object for more information
    return ModuleClass.create.apply(ModuleClass, args);
  },

  // Internal method to set up the region manager
  _initRegionManager: function(){
    this._regionManager = new Marionette.RegionManager();

    this.listenTo(this._regionManager, "region:add", function(name, region){
      this[name] = region;
    });

    this.listenTo(this._regionManager, "region:remove", function(name, region){
      delete this[name];
    });
  }
});

// Copy the `extend` function used by Backbone's classes
Marionette.Application.extend = Marionette.extend;

// Module
// ------

// A simple module system, used to create privacy and encapsulation in
// Marionette applications
Marionette.Module = function(moduleName, app, options){
  this.moduleName = moduleName;
  this.options = _.extend({}, this.options, options);
  this.initialize = options.initialize || this.initialize;

  // store sub-modules
  this.submodules = {};

  this._setupInitializersAndFinalizers();

  // store the configuration for this module
  this.app = app;
  this.startWithParent = true;

  this.triggerMethod = Marionette.triggerMethod;

  if (_.isFunction(this.initialize)){
    this.initialize(this.options, moduleName, app);
  }
};

Marionette.Module.extend = Marionette.extend;

// Extend the Module prototype with events / listenTo, so that the module
// can be used as an event aggregator or pub/sub.
_.extend(Marionette.Module.prototype, Backbone.Events, {

  // Initialize is an empty function by default. Override it with your own
  // initialization logic when extending Marionette.Module.
  initialize: function(){},

  // Initializer for a specific module. Initializers are run when the
  // module's `start` method is called.
  addInitializer: function(callback){
    this._initializerCallbacks.add(callback);
  },

  // Finalizers are run when a module is stopped. They are used to teardown
  // and finalize any variables, references, events and other code that the
  // module had set up.
  addFinalizer: function(callback){
    this._finalizerCallbacks.add(callback);
  },

  // Start the module, and run all of its initializers
  start: function(options){
    // Prevent re-starting a module that is already started
    if (this._isInitialized){ return; }

    // start the sub-modules (depth-first hierarchy)
    _.each(this.submodules, function(mod){
      // check to see if we should start the sub-module with this parent
      if (mod.startWithParent){
        mod.start(options);
      }
    });

    // run the callbacks to "start" the current module
    this.triggerMethod("before:start", options);

    this._initializerCallbacks.run(options, this);
    this._isInitialized = true;

    this.triggerMethod("start", options);
  },

  // Stop this module by running its finalizers and then stop all of
  // the sub-modules for this module
  stop: function(){
    // if we are not initialized, don't bother finalizing
    if (!this._isInitialized){ return; }
    this._isInitialized = false;

    Marionette.triggerMethod.call(this, "before:stop");

    // stop the sub-modules; depth-first, to make sure the
    // sub-modules are stopped / finalized before parents
    _.each(this.submodules, function(mod){ mod.stop(); });

    // run the finalizers
    this._finalizerCallbacks.run(undefined,this);

    // reset the initializers and finalizers
    this._initializerCallbacks.reset();
    this._finalizerCallbacks.reset();

    Marionette.triggerMethod.call(this, "stop");
  },

  // Configure the module with a definition function and any custom args
  // that are to be passed in to the definition function
  addDefinition: function(moduleDefinition, customArgs){
    this._runModuleDefinition(moduleDefinition, customArgs);
  },

  // Internal method: run the module definition function with the correct
  // arguments
  _runModuleDefinition: function(definition, customArgs){
    if (!definition){ return; }

    // build the correct list of arguments for the module definition
    var args = _.flatten([
      this,
      this.app,
      Backbone,
      Marionette,
      Marionette.$, _,
      customArgs
    ]);

    definition.apply(this, args);
  },

  // Internal method: set up new copies of initializers and finalizers.
  // Calling this method will wipe out all existing initializers and
  // finalizers.
  _setupInitializersAndFinalizers: function(){
    this._initializerCallbacks = new Marionette.Callbacks();
    this._finalizerCallbacks = new Marionette.Callbacks();
  }
});

// Type methods to create modules
_.extend(Marionette.Module, {

  // Create a module, hanging off the app parameter as the parent object.
  create: function(app, moduleNames, moduleDefinition){
    var module = app;

    // get the custom args passed in after the module definition and
    // get rid of the module name and definition function
    var customArgs = slice.call(arguments);
    customArgs.splice(0, 3);

    // split the module names and get the length
    moduleNames = moduleNames.split(".");
    var length = moduleNames.length;

    // store the module definition for the last module in the chain
    var moduleDefinitions = [];
    moduleDefinitions[length-1] = moduleDefinition;

    // Loop through all the parts of the module definition
    _.each(moduleNames, function(moduleName, i){
      var parentModule = module;
      module = this._getModule(parentModule, moduleName, app, moduleDefinition);
      this._addModuleDefinition(parentModule, module, moduleDefinitions[i], customArgs);
    }, this);

    // Return the last module in the definition chain
    return module;
  },

  _getModule: function(parentModule, moduleName, app, def, args){
    var options = _.extend({}, def);
    var ModuleClass = this.getClass(def);

    // Get an existing module of this name if we have one
    var module = parentModule[moduleName];

    if (!module){
      // Create a new module if we don't have one
      module = new ModuleClass(moduleName, app, options);
      parentModule[moduleName] = module;
      // store the module on the parent
      parentModule.submodules[moduleName] = module;
    }

    return module;
  },

  getClass: function(moduleDefinition) {
    var ModuleClass = Marionette.Module;

    if (!moduleDefinition) {
      return ModuleClass;
    }

    if (moduleDefinition.prototype instanceof ModuleClass) {
      return moduleDefinition;
    }

    return moduleDefinition.moduleClass || ModuleClass;
  },

  _addModuleDefinition: function(parentModule, module, def, args){
    var fn;
    var startWithParent;

    if (_.isFunction(def)){
      // if a function is supplied for the module definition
      fn = def;
      startWithParent = true;

    } else if (_.isObject(def)){
      // if an object is supplied
      fn = def.define;
      startWithParent = !_.isUndefined(def.startWithParent) ? def.startWithParent : true;

    } else {
      // if nothing is supplied
      startWithParent = true;
    }

    // add module definition if needed
    if (fn){
      module.addDefinition(fn, args);
    }

    // `and` the two together, ensuring a single `false` will prevent it
    // from starting with the parent
    module.startWithParent = module.startWithParent && startWithParent;

    // setup auto-start if needed
    if (module.startWithParent && !module.startWithParentIsConfigured){

      // only configure this once
      module.startWithParentIsConfigured = true;

      // add the module initializer config
      parentModule.addInitializer(function(options){
        if (module.startWithParent){
          module.start(options);
        }
      });

    }

  }
});



  return Marionette;
})(this, Backbone, _);

define("backbone.marionette", ["backbone"], (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Marionette;
    };
}(this)));

/*!

 handlebars v1.2.0

Copyright (C) 2011 by Yehuda Katz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

@license
*/
var Handlebars = (function() {
// handlebars/safe-string.js
var __module4__ = (function() {
  "use strict";
  var __exports__;
  // Build out our basic SafeString type
  function SafeString(string) {
    this.string = string;
  }

  SafeString.prototype.toString = function() {
    return "" + this.string;
  };

  __exports__ = SafeString;
  return __exports__;
})();

// handlebars/utils.js
var __module3__ = (function(__dependency1__) {
  "use strict";
  var __exports__ = {};
  /*jshint -W004 */
  var SafeString = __dependency1__;

  var escape = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;"
  };

  var badChars = /[&<>"'`]/g;
  var possible = /[&<>"'`]/;

  function escapeChar(chr) {
    return escape[chr] || "&amp;";
  }

  function extend(obj, value) {
    for(var key in value) {
      if(Object.prototype.hasOwnProperty.call(value, key)) {
        obj[key] = value[key];
      }
    }
  }

  __exports__.extend = extend;var toString = Object.prototype.toString;
  __exports__.toString = toString;
  // Sourced from lodash
  // https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
  var isFunction = function(value) {
    return typeof value === 'function';
  };
  // fallback for older versions of Chrome and Safari
  if (isFunction(/x/)) {
    isFunction = function(value) {
      return typeof value === 'function' && toString.call(value) === '[object Function]';
    };
  }
  var isFunction;
  __exports__.isFunction = isFunction;
  var isArray = Array.isArray || function(value) {
    return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
  };
  __exports__.isArray = isArray;

  function escapeExpression(string) {
    // don't escape SafeStrings, since they're already safe
    if (string instanceof SafeString) {
      return string.toString();
    } else if (!string && string !== 0) {
      return "";
    }

    // Force a string conversion as this will be done by the append regardless and
    // the regex test will do this transparently behind the scenes, causing issues if
    // an object's to string has escaped characters in it.
    string = "" + string;

    if(!possible.test(string)) { return string; }
    return string.replace(badChars, escapeChar);
  }

  __exports__.escapeExpression = escapeExpression;function isEmpty(value) {
    if (!value && value !== 0) {
      return true;
    } else if (isArray(value) && value.length === 0) {
      return true;
    } else {
      return false;
    }
  }

  __exports__.isEmpty = isEmpty;
  return __exports__;
})(__module4__);

// handlebars/exception.js
var __module5__ = (function() {
  "use strict";
  var __exports__;

  var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

  function Exception(/* message */) {
    var tmp = Error.prototype.constructor.apply(this, arguments);

    // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
    for (var idx = 0; idx < errorProps.length; idx++) {
      this[errorProps[idx]] = tmp[errorProps[idx]];
    }
  }

  Exception.prototype = new Error();

  __exports__ = Exception;
  return __exports__;
})();

// handlebars/base.js
var __module2__ = (function(__dependency1__, __dependency2__) {
  "use strict";
  var __exports__ = {};
  var Utils = __dependency1__;
  var Exception = __dependency2__;

  var VERSION = "1.2.0";
  __exports__.VERSION = VERSION;var COMPILER_REVISION = 4;
  __exports__.COMPILER_REVISION = COMPILER_REVISION;
  var REVISION_CHANGES = {
    1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
    2: '== 1.0.0-rc.3',
    3: '== 1.0.0-rc.4',
    4: '>= 1.0.0'
  };
  __exports__.REVISION_CHANGES = REVISION_CHANGES;
  var isArray = Utils.isArray,
      isFunction = Utils.isFunction,
      toString = Utils.toString,
      objectType = '[object Object]';

  function HandlebarsEnvironment(helpers, partials) {
    this.helpers = helpers || {};
    this.partials = partials || {};

    registerDefaultHelpers(this);
  }

  __exports__.HandlebarsEnvironment = HandlebarsEnvironment;HandlebarsEnvironment.prototype = {
    constructor: HandlebarsEnvironment,

    logger: logger,
    log: log,

    registerHelper: function(name, fn, inverse) {
      if (toString.call(name) === objectType) {
        if (inverse || fn) { throw new Exception('Arg not supported with multiple helpers'); }
        Utils.extend(this.helpers, name);
      } else {
        if (inverse) { fn.not = inverse; }
        this.helpers[name] = fn;
      }
    },

    registerPartial: function(name, str) {
      if (toString.call(name) === objectType) {
        Utils.extend(this.partials,  name);
      } else {
        this.partials[name] = str;
      }
    }
  };

  function registerDefaultHelpers(instance) {
    instance.registerHelper('helperMissing', function(arg) {
      if(arguments.length === 2) {
        return undefined;
      } else {
        throw new Error("Missing helper: '" + arg + "'");
      }
    });

    instance.registerHelper('blockHelperMissing', function(context, options) {
      var inverse = options.inverse || function() {}, fn = options.fn;

      if (isFunction(context)) { context = context.call(this); }

      if(context === true) {
        return fn(this);
      } else if(context === false || context == null) {
        return inverse(this);
      } else if (isArray(context)) {
        if(context.length > 0) {
          return instance.helpers.each(context, options);
        } else {
          return inverse(this);
        }
      } else {
        return fn(context);
      }
    });

    instance.registerHelper('each', function(context, options) {
      var fn = options.fn, inverse = options.inverse;
      var i = 0, ret = "", data;

      if (isFunction(context)) { context = context.call(this); }

      if (options.data) {
        data = createFrame(options.data);
      }

      if(context && typeof context === 'object') {
        if (isArray(context)) {
          for(var j = context.length; i<j; i++) {
            if (data) {
              data.index = i;
              data.first = (i === 0);
              data.last  = (i === (context.length-1));
            }
            ret = ret + fn(context[i], { data: data });
          }
        } else {
          for(var key in context) {
            if(context.hasOwnProperty(key)) {
              if(data) { 
                data.key = key; 
                data.index = i;
                data.first = (i === 0);
              }
              ret = ret + fn(context[key], {data: data});
              i++;
            }
          }
        }
      }

      if(i === 0){
        ret = inverse(this);
      }

      return ret;
    });

    instance.registerHelper('if', function(conditional, options) {
      if (isFunction(conditional)) { conditional = conditional.call(this); }

      // Default behavior is to render the positive path if the value is truthy and not empty.
      // The `includeZero` option may be set to treat the condtional as purely not empty based on the
      // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
      if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
        return options.inverse(this);
      } else {
        return options.fn(this);
      }
    });

    instance.registerHelper('unless', function(conditional, options) {
      return instance.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn, hash: options.hash});
    });

    instance.registerHelper('with', function(context, options) {
      if (isFunction(context)) { context = context.call(this); }

      if (!Utils.isEmpty(context)) return options.fn(context);
    });

    instance.registerHelper('log', function(context, options) {
      var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
      instance.log(level, context);
    });
  }

  var logger = {
    methodMap: { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' },

    // State enum
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    level: 3,

    // can be overridden in the host environment
    log: function(level, obj) {
      if (logger.level <= level) {
        var method = logger.methodMap[level];
        if (typeof console !== 'undefined' && console[method]) {
          console[method].call(console, obj);
        }
      }
    }
  };
  __exports__.logger = logger;
  function log(level, obj) { logger.log(level, obj); }

  __exports__.log = log;var createFrame = function(object) {
    var obj = {};
    Utils.extend(obj, object);
    return obj;
  };
  __exports__.createFrame = createFrame;
  return __exports__;
})(__module3__, __module5__);

// handlebars/runtime.js
var __module6__ = (function(__dependency1__, __dependency2__, __dependency3__) {
  "use strict";
  var __exports__ = {};
  var Utils = __dependency1__;
  var Exception = __dependency2__;
  var COMPILER_REVISION = __dependency3__.COMPILER_REVISION;
  var REVISION_CHANGES = __dependency3__.REVISION_CHANGES;

  function checkRevision(compilerInfo) {
    var compilerRevision = compilerInfo && compilerInfo[0] || 1,
        currentRevision = COMPILER_REVISION;

    if (compilerRevision !== currentRevision) {
      if (compilerRevision < currentRevision) {
        var runtimeVersions = REVISION_CHANGES[currentRevision],
            compilerVersions = REVISION_CHANGES[compilerRevision];
        throw new Error("Template was precompiled with an older version of Handlebars than the current runtime. "+
              "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").");
      } else {
        // Use the embedded version info since the runtime doesn't know about this revision yet
        throw new Error("Template was precompiled with a newer version of Handlebars than the current runtime. "+
              "Please update your runtime to a newer version ("+compilerInfo[1]+").");
      }
    }
  }

  __exports__.checkRevision = checkRevision;// TODO: Remove this line and break up compilePartial

  function template(templateSpec, env) {
    if (!env) {
      throw new Error("No environment passed to template");
    }

    // Note: Using env.VM references rather than local var references throughout this section to allow
    // for external users to override these as psuedo-supported APIs.
    var invokePartialWrapper = function(partial, name, context, helpers, partials, data) {
      var result = env.VM.invokePartial.apply(this, arguments);
      if (result != null) { return result; }

      if (env.compile) {
        var options = { helpers: helpers, partials: partials, data: data };
        partials[name] = env.compile(partial, { data: data !== undefined }, env);
        return partials[name](context, options);
      } else {
        throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
      }
    };

    // Just add water
    var container = {
      escapeExpression: Utils.escapeExpression,
      invokePartial: invokePartialWrapper,
      programs: [],
      program: function(i, fn, data) {
        var programWrapper = this.programs[i];
        if(data) {
          programWrapper = program(i, fn, data);
        } else if (!programWrapper) {
          programWrapper = this.programs[i] = program(i, fn);
        }
        return programWrapper;
      },
      merge: function(param, common) {
        var ret = param || common;

        if (param && common && (param !== common)) {
          ret = {};
          Utils.extend(ret, common);
          Utils.extend(ret, param);
        }
        return ret;
      },
      programWithDepth: env.VM.programWithDepth,
      noop: env.VM.noop,
      compilerInfo: null
    };

    return function(context, options) {
      options = options || {};
      var namespace = options.partial ? options : env,
          helpers,
          partials;

      if (!options.partial) {
        helpers = options.helpers;
        partials = options.partials;
      }
      var result = templateSpec.call(
            container,
            namespace, context,
            helpers,
            partials,
            options.data);

      if (!options.partial) {
        env.VM.checkRevision(container.compilerInfo);
      }

      return result;
    };
  }

  __exports__.template = template;function programWithDepth(i, fn, data /*, $depth */) {
    var args = Array.prototype.slice.call(arguments, 3);

    var prog = function(context, options) {
      options = options || {};

      return fn.apply(this, [context, options.data || data].concat(args));
    };
    prog.program = i;
    prog.depth = args.length;
    return prog;
  }

  __exports__.programWithDepth = programWithDepth;function program(i, fn, data) {
    var prog = function(context, options) {
      options = options || {};

      return fn(context, options.data || data);
    };
    prog.program = i;
    prog.depth = 0;
    return prog;
  }

  __exports__.program = program;function invokePartial(partial, name, context, helpers, partials, data) {
    var options = { partial: true, helpers: helpers, partials: partials, data: data };

    if(partial === undefined) {
      throw new Exception("The partial " + name + " could not be found");
    } else if(partial instanceof Function) {
      return partial(context, options);
    }
  }

  __exports__.invokePartial = invokePartial;function noop() { return ""; }

  __exports__.noop = noop;
  return __exports__;
})(__module3__, __module5__, __module2__);

// handlebars.runtime.js
var __module1__ = (function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__) {
  "use strict";
  var __exports__;
  /*globals Handlebars: true */
  var base = __dependency1__;

  // Each of these augment the Handlebars object. No need to setup here.
  // (This is done to easily share code between commonjs and browse envs)
  var SafeString = __dependency2__;
  var Exception = __dependency3__;
  var Utils = __dependency4__;
  var runtime = __dependency5__;

  // For compatibility and usage outside of module systems, make the Handlebars object a namespace
  var create = function() {
    var hb = new base.HandlebarsEnvironment();

    Utils.extend(hb, base);
    hb.SafeString = SafeString;
    hb.Exception = Exception;
    hb.Utils = Utils;

    hb.VM = runtime;
    hb.template = function(spec) {
      return runtime.template(spec, hb);
    };

    return hb;
  };

  var Handlebars = create();
  Handlebars.create = create;

  __exports__ = Handlebars;
  return __exports__;
})(__module2__, __module4__, __module5__, __module3__, __module6__);

// handlebars/compiler/ast.js
var __module7__ = (function(__dependency1__) {
  "use strict";
  var __exports__;
  var Exception = __dependency1__;

  var AST = {
    ProgramNode: function(statements, inverseStrip, inverse) {
      this.type = "program";
      this.statements = statements;
      this.strip = {};

      if(inverse) {
        this.inverse = new AST.ProgramNode(inverse, inverseStrip);
        this.strip.right = inverseStrip.left;
      } else if (inverseStrip) {
        this.strip.left = inverseStrip.right;
      }
    },

    MustacheNode: function(rawParams, hash, open, strip) {
      this.type = "mustache";
      this.hash = hash;
      this.strip = strip;

      // Open may be a string parsed from the parser or a passed boolean flag
      if (open != null && open.charAt) {
        // Must use charAt to support IE pre-10
        var escapeFlag = open.charAt(3) || open.charAt(2);
        this.escaped = escapeFlag !== '{' && escapeFlag !== '&';
      } else {
        this.escaped = !!open;
      }

      var id = this.id = rawParams[0];
      var params = this.params = rawParams.slice(1);

      // a mustache is an eligible helper if:
      // * its id is simple (a single part, not `this` or `..`)
      var eligibleHelper = this.eligibleHelper = id.isSimple;

      // a mustache is definitely a helper if:
      // * it is an eligible helper, and
      // * it has at least one parameter or hash segment
      this.isHelper = eligibleHelper && (params.length || hash);

      // if a mustache is an eligible helper but not a definite
      // helper, it is ambiguous, and will be resolved in a later
      // pass or at runtime.
    },

    PartialNode: function(partialName, context, strip) {
      this.type         = "partial";
      this.partialName  = partialName;
      this.context      = context;
      this.strip = strip;
    },

    BlockNode: function(mustache, program, inverse, close) {
      if(mustache.id.original !== close.path.original) {
        throw new Exception(mustache.id.original + " doesn't match " + close.path.original);
      }

      this.type = "block";
      this.mustache = mustache;
      this.program  = program;
      this.inverse  = inverse;

      this.strip = {
        left: mustache.strip.left,
        right: close.strip.right
      };

      (program || inverse).strip.left = mustache.strip.right;
      (inverse || program).strip.right = close.strip.left;

      if (inverse && !program) {
        this.isInverse = true;
      }
    },

    ContentNode: function(string) {
      this.type = "content";
      this.string = string;
    },

    HashNode: function(pairs) {
      this.type = "hash";
      this.pairs = pairs;
    },

    IdNode: function(parts) {
      this.type = "ID";

      var original = "",
          dig = [],
          depth = 0;

      for(var i=0,l=parts.length; i<l; i++) {
        var part = parts[i].part;
        original += (parts[i].separator || '') + part;

        if (part === ".." || part === "." || part === "this") {
          if (dig.length > 0) { throw new Exception("Invalid path: " + original); }
          else if (part === "..") { depth++; }
          else { this.isScoped = true; }
        }
        else { dig.push(part); }
      }

      this.original = original;
      this.parts    = dig;
      this.string   = dig.join('.');
      this.depth    = depth;

      // an ID is simple if it only has one part, and that part is not
      // `..` or `this`.
      this.isSimple = parts.length === 1 && !this.isScoped && depth === 0;

      this.stringModeValue = this.string;
    },

    PartialNameNode: function(name) {
      this.type = "PARTIAL_NAME";
      this.name = name.original;
    },

    DataNode: function(id) {
      this.type = "DATA";
      this.id = id;
    },

    StringNode: function(string) {
      this.type = "STRING";
      this.original =
        this.string =
        this.stringModeValue = string;
    },

    IntegerNode: function(integer) {
      this.type = "INTEGER";
      this.original =
        this.integer = integer;
      this.stringModeValue = Number(integer);
    },

    BooleanNode: function(bool) {
      this.type = "BOOLEAN";
      this.bool = bool;
      this.stringModeValue = bool === "true";
    },

    CommentNode: function(comment) {
      this.type = "comment";
      this.comment = comment;
    }
  };

  // Must be exported as an object rather than the root of the module as the jison lexer
  // most modify the object to operate properly.
  __exports__ = AST;
  return __exports__;
})(__module5__);

// handlebars/compiler/parser.js
var __module9__ = (function() {
  "use strict";
  var __exports__;
  /* jshint ignore:start */
  /* Jison generated parser */
  var handlebars = (function(){
  var parser = {trace: function trace() { },
  yy: {},
  symbols_: {"error":2,"root":3,"statements":4,"EOF":5,"program":6,"simpleInverse":7,"statement":8,"openInverse":9,"closeBlock":10,"openBlock":11,"mustache":12,"partial":13,"CONTENT":14,"COMMENT":15,"OPEN_BLOCK":16,"inMustache":17,"CLOSE":18,"OPEN_INVERSE":19,"OPEN_ENDBLOCK":20,"path":21,"OPEN":22,"OPEN_UNESCAPED":23,"CLOSE_UNESCAPED":24,"OPEN_PARTIAL":25,"partialName":26,"partial_option0":27,"inMustache_repetition0":28,"inMustache_option0":29,"dataName":30,"param":31,"STRING":32,"INTEGER":33,"BOOLEAN":34,"hash":35,"hash_repetition_plus0":36,"hashSegment":37,"ID":38,"EQUALS":39,"DATA":40,"pathSegments":41,"SEP":42,"$accept":0,"$end":1},
  terminals_: {2:"error",5:"EOF",14:"CONTENT",15:"COMMENT",16:"OPEN_BLOCK",18:"CLOSE",19:"OPEN_INVERSE",20:"OPEN_ENDBLOCK",22:"OPEN",23:"OPEN_UNESCAPED",24:"CLOSE_UNESCAPED",25:"OPEN_PARTIAL",32:"STRING",33:"INTEGER",34:"BOOLEAN",38:"ID",39:"EQUALS",40:"DATA",42:"SEP"},
  productions_: [0,[3,2],[3,1],[6,2],[6,3],[6,2],[6,1],[6,1],[6,0],[4,1],[4,2],[8,3],[8,3],[8,1],[8,1],[8,1],[8,1],[11,3],[9,3],[10,3],[12,3],[12,3],[13,4],[7,2],[17,3],[17,1],[31,1],[31,1],[31,1],[31,1],[31,1],[35,1],[37,3],[26,1],[26,1],[26,1],[30,2],[21,1],[41,3],[41,1],[27,0],[27,1],[28,0],[28,2],[29,0],[29,1],[36,1],[36,2]],
  performAction: function anonymous(yytext,yyleng,yylineno,yy,yystate,$$,_$) {

  var $0 = $$.length - 1;
  switch (yystate) {
  case 1: return new yy.ProgramNode($$[$0-1]); 
  break;
  case 2: return new yy.ProgramNode([]); 
  break;
  case 3:this.$ = new yy.ProgramNode([], $$[$0-1], $$[$0]);
  break;
  case 4:this.$ = new yy.ProgramNode($$[$0-2], $$[$0-1], $$[$0]);
  break;
  case 5:this.$ = new yy.ProgramNode($$[$0-1], $$[$0], []);
  break;
  case 6:this.$ = new yy.ProgramNode($$[$0]);
  break;
  case 7:this.$ = new yy.ProgramNode([]);
  break;
  case 8:this.$ = new yy.ProgramNode([]);
  break;
  case 9:this.$ = [$$[$0]];
  break;
  case 10: $$[$0-1].push($$[$0]); this.$ = $$[$0-1]; 
  break;
  case 11:this.$ = new yy.BlockNode($$[$0-2], $$[$0-1].inverse, $$[$0-1], $$[$0]);
  break;
  case 12:this.$ = new yy.BlockNode($$[$0-2], $$[$0-1], $$[$0-1].inverse, $$[$0]);
  break;
  case 13:this.$ = $$[$0];
  break;
  case 14:this.$ = $$[$0];
  break;
  case 15:this.$ = new yy.ContentNode($$[$0]);
  break;
  case 16:this.$ = new yy.CommentNode($$[$0]);
  break;
  case 17:this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1], $$[$0-2], stripFlags($$[$0-2], $$[$0]));
  break;
  case 18:this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1], $$[$0-2], stripFlags($$[$0-2], $$[$0]));
  break;
  case 19:this.$ = {path: $$[$0-1], strip: stripFlags($$[$0-2], $$[$0])};
  break;
  case 20:this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1], $$[$0-2], stripFlags($$[$0-2], $$[$0]));
  break;
  case 21:this.$ = new yy.MustacheNode($$[$0-1][0], $$[$0-1][1], $$[$0-2], stripFlags($$[$0-2], $$[$0]));
  break;
  case 22:this.$ = new yy.PartialNode($$[$0-2], $$[$0-1], stripFlags($$[$0-3], $$[$0]));
  break;
  case 23:this.$ = stripFlags($$[$0-1], $$[$0]);
  break;
  case 24:this.$ = [[$$[$0-2]].concat($$[$0-1]), $$[$0]];
  break;
  case 25:this.$ = [[$$[$0]], null];
  break;
  case 26:this.$ = $$[$0];
  break;
  case 27:this.$ = new yy.StringNode($$[$0]);
  break;
  case 28:this.$ = new yy.IntegerNode($$[$0]);
  break;
  case 29:this.$ = new yy.BooleanNode($$[$0]);
  break;
  case 30:this.$ = $$[$0];
  break;
  case 31:this.$ = new yy.HashNode($$[$0]);
  break;
  case 32:this.$ = [$$[$0-2], $$[$0]];
  break;
  case 33:this.$ = new yy.PartialNameNode($$[$0]);
  break;
  case 34:this.$ = new yy.PartialNameNode(new yy.StringNode($$[$0]));
  break;
  case 35:this.$ = new yy.PartialNameNode(new yy.IntegerNode($$[$0]));
  break;
  case 36:this.$ = new yy.DataNode($$[$0]);
  break;
  case 37:this.$ = new yy.IdNode($$[$0]);
  break;
  case 38: $$[$0-2].push({part: $$[$0], separator: $$[$0-1]}); this.$ = $$[$0-2]; 
  break;
  case 39:this.$ = [{part: $$[$0]}];
  break;
  case 42:this.$ = [];
  break;
  case 43:$$[$0-1].push($$[$0]);
  break;
  case 46:this.$ = [$$[$0]];
  break;
  case 47:$$[$0-1].push($$[$0]);
  break;
  }
  },
  table: [{3:1,4:2,5:[1,3],8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],22:[1,13],23:[1,14],25:[1,15]},{1:[3]},{5:[1,16],8:17,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],22:[1,13],23:[1,14],25:[1,15]},{1:[2,2]},{5:[2,9],14:[2,9],15:[2,9],16:[2,9],19:[2,9],20:[2,9],22:[2,9],23:[2,9],25:[2,9]},{4:20,6:18,7:19,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,21],20:[2,8],22:[1,13],23:[1,14],25:[1,15]},{4:20,6:22,7:19,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,21],20:[2,8],22:[1,13],23:[1,14],25:[1,15]},{5:[2,13],14:[2,13],15:[2,13],16:[2,13],19:[2,13],20:[2,13],22:[2,13],23:[2,13],25:[2,13]},{5:[2,14],14:[2,14],15:[2,14],16:[2,14],19:[2,14],20:[2,14],22:[2,14],23:[2,14],25:[2,14]},{5:[2,15],14:[2,15],15:[2,15],16:[2,15],19:[2,15],20:[2,15],22:[2,15],23:[2,15],25:[2,15]},{5:[2,16],14:[2,16],15:[2,16],16:[2,16],19:[2,16],20:[2,16],22:[2,16],23:[2,16],25:[2,16]},{17:23,21:24,30:25,38:[1,28],40:[1,27],41:26},{17:29,21:24,30:25,38:[1,28],40:[1,27],41:26},{17:30,21:24,30:25,38:[1,28],40:[1,27],41:26},{17:31,21:24,30:25,38:[1,28],40:[1,27],41:26},{21:33,26:32,32:[1,34],33:[1,35],38:[1,28],41:26},{1:[2,1]},{5:[2,10],14:[2,10],15:[2,10],16:[2,10],19:[2,10],20:[2,10],22:[2,10],23:[2,10],25:[2,10]},{10:36,20:[1,37]},{4:38,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,7],22:[1,13],23:[1,14],25:[1,15]},{7:39,8:17,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,21],20:[2,6],22:[1,13],23:[1,14],25:[1,15]},{17:23,18:[1,40],21:24,30:25,38:[1,28],40:[1,27],41:26},{10:41,20:[1,37]},{18:[1,42]},{18:[2,42],24:[2,42],28:43,32:[2,42],33:[2,42],34:[2,42],38:[2,42],40:[2,42]},{18:[2,25],24:[2,25]},{18:[2,37],24:[2,37],32:[2,37],33:[2,37],34:[2,37],38:[2,37],40:[2,37],42:[1,44]},{21:45,38:[1,28],41:26},{18:[2,39],24:[2,39],32:[2,39],33:[2,39],34:[2,39],38:[2,39],40:[2,39],42:[2,39]},{18:[1,46]},{18:[1,47]},{24:[1,48]},{18:[2,40],21:50,27:49,38:[1,28],41:26},{18:[2,33],38:[2,33]},{18:[2,34],38:[2,34]},{18:[2,35],38:[2,35]},{5:[2,11],14:[2,11],15:[2,11],16:[2,11],19:[2,11],20:[2,11],22:[2,11],23:[2,11],25:[2,11]},{21:51,38:[1,28],41:26},{8:17,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,3],22:[1,13],23:[1,14],25:[1,15]},{4:52,8:4,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,5],22:[1,13],23:[1,14],25:[1,15]},{14:[2,23],15:[2,23],16:[2,23],19:[2,23],20:[2,23],22:[2,23],23:[2,23],25:[2,23]},{5:[2,12],14:[2,12],15:[2,12],16:[2,12],19:[2,12],20:[2,12],22:[2,12],23:[2,12],25:[2,12]},{14:[2,18],15:[2,18],16:[2,18],19:[2,18],20:[2,18],22:[2,18],23:[2,18],25:[2,18]},{18:[2,44],21:56,24:[2,44],29:53,30:60,31:54,32:[1,57],33:[1,58],34:[1,59],35:55,36:61,37:62,38:[1,63],40:[1,27],41:26},{38:[1,64]},{18:[2,36],24:[2,36],32:[2,36],33:[2,36],34:[2,36],38:[2,36],40:[2,36]},{14:[2,17],15:[2,17],16:[2,17],19:[2,17],20:[2,17],22:[2,17],23:[2,17],25:[2,17]},{5:[2,20],14:[2,20],15:[2,20],16:[2,20],19:[2,20],20:[2,20],22:[2,20],23:[2,20],25:[2,20]},{5:[2,21],14:[2,21],15:[2,21],16:[2,21],19:[2,21],20:[2,21],22:[2,21],23:[2,21],25:[2,21]},{18:[1,65]},{18:[2,41]},{18:[1,66]},{8:17,9:5,11:6,12:7,13:8,14:[1,9],15:[1,10],16:[1,12],19:[1,11],20:[2,4],22:[1,13],23:[1,14],25:[1,15]},{18:[2,24],24:[2,24]},{18:[2,43],24:[2,43],32:[2,43],33:[2,43],34:[2,43],38:[2,43],40:[2,43]},{18:[2,45],24:[2,45]},{18:[2,26],24:[2,26],32:[2,26],33:[2,26],34:[2,26],38:[2,26],40:[2,26]},{18:[2,27],24:[2,27],32:[2,27],33:[2,27],34:[2,27],38:[2,27],40:[2,27]},{18:[2,28],24:[2,28],32:[2,28],33:[2,28],34:[2,28],38:[2,28],40:[2,28]},{18:[2,29],24:[2,29],32:[2,29],33:[2,29],34:[2,29],38:[2,29],40:[2,29]},{18:[2,30],24:[2,30],32:[2,30],33:[2,30],34:[2,30],38:[2,30],40:[2,30]},{18:[2,31],24:[2,31],37:67,38:[1,68]},{18:[2,46],24:[2,46],38:[2,46]},{18:[2,39],24:[2,39],32:[2,39],33:[2,39],34:[2,39],38:[2,39],39:[1,69],40:[2,39],42:[2,39]},{18:[2,38],24:[2,38],32:[2,38],33:[2,38],34:[2,38],38:[2,38],40:[2,38],42:[2,38]},{5:[2,22],14:[2,22],15:[2,22],16:[2,22],19:[2,22],20:[2,22],22:[2,22],23:[2,22],25:[2,22]},{5:[2,19],14:[2,19],15:[2,19],16:[2,19],19:[2,19],20:[2,19],22:[2,19],23:[2,19],25:[2,19]},{18:[2,47],24:[2,47],38:[2,47]},{39:[1,69]},{21:56,30:60,31:70,32:[1,57],33:[1,58],34:[1,59],38:[1,28],40:[1,27],41:26},{18:[2,32],24:[2,32],38:[2,32]}],
  defaultActions: {3:[2,2],16:[2,1],50:[2,41]},
  parseError: function parseError(str, hash) {
      throw new Error(str);
  },
  parse: function parse(input) {
      var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
      this.lexer.setInput(input);
      this.lexer.yy = this.yy;
      this.yy.lexer = this.lexer;
      this.yy.parser = this;
      if (typeof this.lexer.yylloc == "undefined")
          this.lexer.yylloc = {};
      var yyloc = this.lexer.yylloc;
      lstack.push(yyloc);
      var ranges = this.lexer.options && this.lexer.options.ranges;
      if (typeof this.yy.parseError === "function")
          this.parseError = this.yy.parseError;
      function popStack(n) {
          stack.length = stack.length - 2 * n;
          vstack.length = vstack.length - n;
          lstack.length = lstack.length - n;
      }
      function lex() {
          var token;
          token = self.lexer.lex() || 1;
          if (typeof token !== "number") {
              token = self.symbols_[token] || token;
          }
          return token;
      }
      var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
      while (true) {
          state = stack[stack.length - 1];
          if (this.defaultActions[state]) {
              action = this.defaultActions[state];
          } else {
              if (symbol === null || typeof symbol == "undefined") {
                  symbol = lex();
              }
              action = table[state] && table[state][symbol];
          }
          if (typeof action === "undefined" || !action.length || !action[0]) {
              var errStr = "";
              if (!recovering) {
                  expected = [];
                  for (p in table[state])
                      if (this.terminals_[p] && p > 2) {
                          expected.push("'" + this.terminals_[p] + "'");
                      }
                  if (this.lexer.showPosition) {
                      errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
                  } else {
                      errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1?"end of input":"'" + (this.terminals_[symbol] || symbol) + "'");
                  }
                  this.parseError(errStr, {text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, loc: yyloc, expected: expected});
              }
          }
          if (action[0] instanceof Array && action.length > 1) {
              throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
          }
          switch (action[0]) {
          case 1:
              stack.push(symbol);
              vstack.push(this.lexer.yytext);
              lstack.push(this.lexer.yylloc);
              stack.push(action[1]);
              symbol = null;
              if (!preErrorSymbol) {
                  yyleng = this.lexer.yyleng;
                  yytext = this.lexer.yytext;
                  yylineno = this.lexer.yylineno;
                  yyloc = this.lexer.yylloc;
                  if (recovering > 0)
                      recovering--;
              } else {
                  symbol = preErrorSymbol;
                  preErrorSymbol = null;
              }
              break;
          case 2:
              len = this.productions_[action[1]][1];
              yyval.$ = vstack[vstack.length - len];
              yyval._$ = {first_line: lstack[lstack.length - (len || 1)].first_line, last_line: lstack[lstack.length - 1].last_line, first_column: lstack[lstack.length - (len || 1)].first_column, last_column: lstack[lstack.length - 1].last_column};
              if (ranges) {
                  yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
              }
              r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
              if (typeof r !== "undefined") {
                  return r;
              }
              if (len) {
                  stack = stack.slice(0, -1 * len * 2);
                  vstack = vstack.slice(0, -1 * len);
                  lstack = lstack.slice(0, -1 * len);
              }
              stack.push(this.productions_[action[1]][0]);
              vstack.push(yyval.$);
              lstack.push(yyval._$);
              newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
              stack.push(newState);
              break;
          case 3:
              return true;
          }
      }
      return true;
  }
  };


  function stripFlags(open, close) {
    return {
      left: open.charAt(2) === '~',
      right: close.charAt(0) === '~' || close.charAt(1) === '~'
    };
  }

  /* Jison generated lexer */
  var lexer = (function(){
  var lexer = ({EOF:1,
  parseError:function parseError(str, hash) {
          if (this.yy.parser) {
              this.yy.parser.parseError(str, hash);
          } else {
              throw new Error(str);
          }
      },
  setInput:function (input) {
          this._input = input;
          this._more = this._less = this.done = false;
          this.yylineno = this.yyleng = 0;
          this.yytext = this.matched = this.match = '';
          this.conditionStack = ['INITIAL'];
          this.yylloc = {first_line:1,first_column:0,last_line:1,last_column:0};
          if (this.options.ranges) this.yylloc.range = [0,0];
          this.offset = 0;
          return this;
      },
  input:function () {
          var ch = this._input[0];
          this.yytext += ch;
          this.yyleng++;
          this.offset++;
          this.match += ch;
          this.matched += ch;
          var lines = ch.match(/(?:\r\n?|\n).*/g);
          if (lines) {
              this.yylineno++;
              this.yylloc.last_line++;
          } else {
              this.yylloc.last_column++;
          }
          if (this.options.ranges) this.yylloc.range[1]++;

          this._input = this._input.slice(1);
          return ch;
      },
  unput:function (ch) {
          var len = ch.length;
          var lines = ch.split(/(?:\r\n?|\n)/g);

          this._input = ch + this._input;
          this.yytext = this.yytext.substr(0, this.yytext.length-len-1);
          //this.yyleng -= len;
          this.offset -= len;
          var oldLines = this.match.split(/(?:\r\n?|\n)/g);
          this.match = this.match.substr(0, this.match.length-1);
          this.matched = this.matched.substr(0, this.matched.length-1);

          if (lines.length-1) this.yylineno -= lines.length-1;
          var r = this.yylloc.range;

          this.yylloc = {first_line: this.yylloc.first_line,
            last_line: this.yylineno+1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length:
                this.yylloc.first_column - len
            };

          if (this.options.ranges) {
              this.yylloc.range = [r[0], r[0] + this.yyleng - len];
          }
          return this;
      },
  more:function () {
          this._more = true;
          return this;
      },
  less:function (n) {
          this.unput(this.match.slice(n));
      },
  pastInput:function () {
          var past = this.matched.substr(0, this.matched.length - this.match.length);
          return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
      },
  upcomingInput:function () {
          var next = this.match;
          if (next.length < 20) {
              next += this._input.substr(0, 20-next.length);
          }
          return (next.substr(0,20)+(next.length > 20 ? '...':'')).replace(/\n/g, "");
      },
  showPosition:function () {
          var pre = this.pastInput();
          var c = new Array(pre.length + 1).join("-");
          return pre + this.upcomingInput() + "\n" + c+"^";
      },
  next:function () {
          if (this.done) {
              return this.EOF;
          }
          if (!this._input) this.done = true;

          var token,
              match,
              tempMatch,
              index,
              col,
              lines;
          if (!this._more) {
              this.yytext = '';
              this.match = '';
          }
          var rules = this._currentRules();
          for (var i=0;i < rules.length; i++) {
              tempMatch = this._input.match(this.rules[rules[i]]);
              if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                  match = tempMatch;
                  index = i;
                  if (!this.options.flex) break;
              }
          }
          if (match) {
              lines = match[0].match(/(?:\r\n?|\n).*/g);
              if (lines) this.yylineno += lines.length;
              this.yylloc = {first_line: this.yylloc.last_line,
                             last_line: this.yylineno+1,
                             first_column: this.yylloc.last_column,
                             last_column: lines ? lines[lines.length-1].length-lines[lines.length-1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length};
              this.yytext += match[0];
              this.match += match[0];
              this.matches = match;
              this.yyleng = this.yytext.length;
              if (this.options.ranges) {
                  this.yylloc.range = [this.offset, this.offset += this.yyleng];
              }
              this._more = false;
              this._input = this._input.slice(match[0].length);
              this.matched += match[0];
              token = this.performAction.call(this, this.yy, this, rules[index],this.conditionStack[this.conditionStack.length-1]);
              if (this.done && this._input) this.done = false;
              if (token) return token;
              else return;
          }
          if (this._input === "") {
              return this.EOF;
          } else {
              return this.parseError('Lexical error on line '+(this.yylineno+1)+'. Unrecognized text.\n'+this.showPosition(),
                      {text: "", token: null, line: this.yylineno});
          }
      },
  lex:function lex() {
          var r = this.next();
          if (typeof r !== 'undefined') {
              return r;
          } else {
              return this.lex();
          }
      },
  begin:function begin(condition) {
          this.conditionStack.push(condition);
      },
  popState:function popState() {
          return this.conditionStack.pop();
      },
  _currentRules:function _currentRules() {
          return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;
      },
  topState:function () {
          return this.conditionStack[this.conditionStack.length-2];
      },
  pushState:function begin(condition) {
          this.begin(condition);
      }});
  lexer.options = {};
  lexer.performAction = function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {


  function strip(start, end) {
    return yy_.yytext = yy_.yytext.substr(start, yy_.yyleng-end);
  }


  var YYSTATE=YY_START
  switch($avoiding_name_collisions) {
  case 0:
                                     if(yy_.yytext.slice(-2) === "\\\\") {
                                       strip(0,1);
                                       this.begin("mu");
                                     } else if(yy_.yytext.slice(-1) === "\\") {
                                       strip(0,1);
                                       this.begin("emu");
                                     } else {
                                       this.begin("mu");
                                     }
                                     if(yy_.yytext) return 14;
                                   
  break;
  case 1:return 14;
  break;
  case 2:
                                     this.popState();
                                     return 14;
                                   
  break;
  case 3:strip(0,4); this.popState(); return 15;
  break;
  case 4:return 25;
  break;
  case 5:return 16;
  break;
  case 6:return 20;
  break;
  case 7:return 19;
  break;
  case 8:return 19;
  break;
  case 9:return 23;
  break;
  case 10:return 22;
  break;
  case 11:this.popState(); this.begin('com');
  break;
  case 12:strip(3,5); this.popState(); return 15;
  break;
  case 13:return 22;
  break;
  case 14:return 39;
  break;
  case 15:return 38;
  break;
  case 16:return 38;
  break;
  case 17:return 42;
  break;
  case 18:// ignore whitespace
  break;
  case 19:this.popState(); return 24;
  break;
  case 20:this.popState(); return 18;
  break;
  case 21:yy_.yytext = strip(1,2).replace(/\\"/g,'"'); return 32;
  break;
  case 22:yy_.yytext = strip(1,2).replace(/\\'/g,"'"); return 32;
  break;
  case 23:return 40;
  break;
  case 24:return 34;
  break;
  case 25:return 34;
  break;
  case 26:return 33;
  break;
  case 27:return 38;
  break;
  case 28:yy_.yytext = strip(1,2); return 38;
  break;
  case 29:return 'INVALID';
  break;
  case 30:return 5;
  break;
  }
  };
  lexer.rules = [/^(?:[^\x00]*?(?=(\{\{)))/,/^(?:[^\x00]+)/,/^(?:[^\x00]{2,}?(?=(\{\{|\\\{\{|\\\\\{\{|$)))/,/^(?:[\s\S]*?--\}\})/,/^(?:\{\{(~)?>)/,/^(?:\{\{(~)?#)/,/^(?:\{\{(~)?\/)/,/^(?:\{\{(~)?\^)/,/^(?:\{\{(~)?\s*else\b)/,/^(?:\{\{(~)?\{)/,/^(?:\{\{(~)?&)/,/^(?:\{\{!--)/,/^(?:\{\{![\s\S]*?\}\})/,/^(?:\{\{(~)?)/,/^(?:=)/,/^(?:\.\.)/,/^(?:\.(?=([=~}\s\/.])))/,/^(?:[\/.])/,/^(?:\s+)/,/^(?:\}(~)?\}\})/,/^(?:(~)?\}\})/,/^(?:"(\\["]|[^"])*")/,/^(?:'(\\[']|[^'])*')/,/^(?:@)/,/^(?:true(?=([~}\s])))/,/^(?:false(?=([~}\s])))/,/^(?:-?[0-9]+(?=([~}\s])))/,/^(?:([^\s!"#%-,\.\/;->@\[-\^`\{-~]+(?=([=~}\s\/.]))))/,/^(?:\[[^\]]*\])/,/^(?:.)/,/^(?:$)/];
  lexer.conditions = {"mu":{"rules":[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],"inclusive":false},"emu":{"rules":[2],"inclusive":false},"com":{"rules":[3],"inclusive":false},"INITIAL":{"rules":[0,1,30],"inclusive":true}};
  return lexer;})()
  parser.lexer = lexer;
  function Parser () { this.yy = {}; }Parser.prototype = parser;parser.Parser = Parser;
  return new Parser;
  })();__exports__ = handlebars;
  /* jshint ignore:end */
  return __exports__;
})();

// handlebars/compiler/base.js
var __module8__ = (function(__dependency1__, __dependency2__) {
  "use strict";
  var __exports__ = {};
  var parser = __dependency1__;
  var AST = __dependency2__;

  __exports__.parser = parser;

  function parse(input) {
    // Just return if an already-compile AST was passed in.
    if(input.constructor === AST.ProgramNode) { return input; }

    parser.yy = AST;
    return parser.parse(input);
  }

  __exports__.parse = parse;
  return __exports__;
})(__module9__, __module7__);

// handlebars/compiler/javascript-compiler.js
var __module11__ = (function(__dependency1__) {
  "use strict";
  var __exports__;
  var COMPILER_REVISION = __dependency1__.COMPILER_REVISION;
  var REVISION_CHANGES = __dependency1__.REVISION_CHANGES;
  var log = __dependency1__.log;

  function Literal(value) {
    this.value = value;
  }

  function JavaScriptCompiler() {}

  JavaScriptCompiler.prototype = {
    // PUBLIC API: You can override these methods in a subclass to provide
    // alternative compiled forms for name lookup and buffering semantics
    nameLookup: function(parent, name /* , type*/) {
      var wrap,
          ret;
      if (parent.indexOf('depth') === 0) {
        wrap = true;
      }

      if (/^[0-9]+$/.test(name)) {
        ret = parent + "[" + name + "]";
      } else if (JavaScriptCompiler.isValidJavaScriptVariableName(name)) {
        ret = parent + "." + name;
      }
      else {
        ret = parent + "['" + name + "']";
      }

      if (wrap) {
        return '(' + parent + ' && ' + ret + ')';
      } else {
        return ret;
      }
    },

    compilerInfo: function() {
      var revision = COMPILER_REVISION,
          versions = REVISION_CHANGES[revision];
      return "this.compilerInfo = ["+revision+",'"+versions+"'];\n";
    },

    appendToBuffer: function(string) {
      if (this.environment.isSimple) {
        return "return " + string + ";";
      } else {
        return {
          appendToBuffer: true,
          content: string,
          toString: function() { return "buffer += " + string + ";"; }
        };
      }
    },

    initializeBuffer: function() {
      return this.quotedString("");
    },

    namespace: "Handlebars",
    // END PUBLIC API

    compile: function(environment, options, context, asObject) {
      this.environment = environment;
      this.options = options || {};

      log('debug', this.environment.disassemble() + "\n\n");

      this.name = this.environment.name;
      this.isChild = !!context;
      this.context = context || {
        programs: [],
        environments: [],
        aliases: { }
      };

      this.preamble();

      this.stackSlot = 0;
      this.stackVars = [];
      this.registers = { list: [] };
      this.compileStack = [];
      this.inlineStack = [];

      this.compileChildren(environment, options);

      var opcodes = environment.opcodes, opcode;

      this.i = 0;

      for(var l=opcodes.length; this.i<l; this.i++) {
        opcode = opcodes[this.i];

        if(opcode.opcode === 'DECLARE') {
          this[opcode.name] = opcode.value;
        } else {
          this[opcode.opcode].apply(this, opcode.args);
        }

        // Reset the stripNext flag if it was not set by this operation.
        if (opcode.opcode !== this.stripNext) {
          this.stripNext = false;
        }
      }

      // Flush any trailing content that might be pending.
      this.pushSource('');

      return this.createFunctionContext(asObject);
    },

    preamble: function() {
      var out = [];

      if (!this.isChild) {
        var namespace = this.namespace;

        var copies = "helpers = this.merge(helpers, " + namespace + ".helpers);";
        if (this.environment.usePartial) { copies = copies + " partials = this.merge(partials, " + namespace + ".partials);"; }
        if (this.options.data) { copies = copies + " data = data || {};"; }
        out.push(copies);
      } else {
        out.push('');
      }

      if (!this.environment.isSimple) {
        out.push(", buffer = " + this.initializeBuffer());
      } else {
        out.push("");
      }

      // track the last context pushed into place to allow skipping the
      // getContext opcode when it would be a noop
      this.lastContext = 0;
      this.source = out;
    },

    createFunctionContext: function(asObject) {
      var locals = this.stackVars.concat(this.registers.list);

      if(locals.length > 0) {
        this.source[1] = this.source[1] + ", " + locals.join(", ");
      }

      // Generate minimizer alias mappings
      if (!this.isChild) {
        for (var alias in this.context.aliases) {
          if (this.context.aliases.hasOwnProperty(alias)) {
            this.source[1] = this.source[1] + ', ' + alias + '=' + this.context.aliases[alias];
          }
        }
      }

      if (this.source[1]) {
        this.source[1] = "var " + this.source[1].substring(2) + ";";
      }

      // Merge children
      if (!this.isChild) {
        this.source[1] += '\n' + this.context.programs.join('\n') + '\n';
      }

      if (!this.environment.isSimple) {
        this.pushSource("return buffer;");
      }

      var params = this.isChild ? ["depth0", "data"] : ["Handlebars", "depth0", "helpers", "partials", "data"];

      for(var i=0, l=this.environment.depths.list.length; i<l; i++) {
        params.push("depth" + this.environment.depths.list[i]);
      }

      // Perform a second pass over the output to merge content when possible
      var source = this.mergeSource();

      if (!this.isChild) {
        source = this.compilerInfo()+source;
      }

      if (asObject) {
        params.push(source);

        return Function.apply(this, params);
      } else {
        var functionSource = 'function ' + (this.name || '') + '(' + params.join(',') + ') {\n  ' + source + '}';
        log('debug', functionSource + "\n\n");
        return functionSource;
      }
    },
    mergeSource: function() {
      // WARN: We are not handling the case where buffer is still populated as the source should
      // not have buffer append operations as their final action.
      var source = '',
          buffer;
      for (var i = 0, len = this.source.length; i < len; i++) {
        var line = this.source[i];
        if (line.appendToBuffer) {
          if (buffer) {
            buffer = buffer + '\n    + ' + line.content;
          } else {
            buffer = line.content;
          }
        } else {
          if (buffer) {
            source += 'buffer += ' + buffer + ';\n  ';
            buffer = undefined;
          }
          source += line + '\n  ';
        }
      }
      return source;
    },

    // [blockValue]
    //
    // On stack, before: hash, inverse, program, value
    // On stack, after: return value of blockHelperMissing
    //
    // The purpose of this opcode is to take a block of the form
    // `{{#foo}}...{{/foo}}`, resolve the value of `foo`, and
    // replace it on the stack with the result of properly
    // invoking blockHelperMissing.
    blockValue: function() {
      this.context.aliases.blockHelperMissing = 'helpers.blockHelperMissing';

      var params = ["depth0"];
      this.setupParams(0, params);

      this.replaceStack(function(current) {
        params.splice(1, 0, current);
        return "blockHelperMissing.call(" + params.join(", ") + ")";
      });
    },

    // [ambiguousBlockValue]
    //
    // On stack, before: hash, inverse, program, value
    // Compiler value, before: lastHelper=value of last found helper, if any
    // On stack, after, if no lastHelper: same as [blockValue]
    // On stack, after, if lastHelper: value
    ambiguousBlockValue: function() {
      this.context.aliases.blockHelperMissing = 'helpers.blockHelperMissing';

      var params = ["depth0"];
      this.setupParams(0, params);

      var current = this.topStack();
      params.splice(1, 0, current);

      // Use the options value generated from the invocation
      params[params.length-1] = 'options';

      this.pushSource("if (!" + this.lastHelper + ") { " + current + " = blockHelperMissing.call(" + params.join(", ") + "); }");
    },

    // [appendContent]
    //
    // On stack, before: ...
    // On stack, after: ...
    //
    // Appends the string value of `content` to the current buffer
    appendContent: function(content) {
      if (this.pendingContent) {
        content = this.pendingContent + content;
      }
      if (this.stripNext) {
        content = content.replace(/^\s+/, '');
      }

      this.pendingContent = content;
    },

    // [strip]
    //
    // On stack, before: ...
    // On stack, after: ...
    //
    // Removes any trailing whitespace from the prior content node and flags
    // the next operation for stripping if it is a content node.
    strip: function() {
      if (this.pendingContent) {
        this.pendingContent = this.pendingContent.replace(/\s+$/, '');
      }
      this.stripNext = 'strip';
    },

    // [append]
    //
    // On stack, before: value, ...
    // On stack, after: ...
    //
    // Coerces `value` to a String and appends it to the current buffer.
    //
    // If `value` is truthy, or 0, it is coerced into a string and appended
    // Otherwise, the empty string is appended
    append: function() {
      // Force anything that is inlined onto the stack so we don't have duplication
      // when we examine local
      this.flushInline();
      var local = this.popStack();
      this.pushSource("if(" + local + " || " + local + " === 0) { " + this.appendToBuffer(local) + " }");
      if (this.environment.isSimple) {
        this.pushSource("else { " + this.appendToBuffer("''") + " }");
      }
    },

    // [appendEscaped]
    //
    // On stack, before: value, ...
    // On stack, after: ...
    //
    // Escape `value` and append it to the buffer
    appendEscaped: function() {
      this.context.aliases.escapeExpression = 'this.escapeExpression';

      this.pushSource(this.appendToBuffer("escapeExpression(" + this.popStack() + ")"));
    },

    // [getContext]
    //
    // On stack, before: ...
    // On stack, after: ...
    // Compiler value, after: lastContext=depth
    //
    // Set the value of the `lastContext` compiler value to the depth
    getContext: function(depth) {
      if(this.lastContext !== depth) {
        this.lastContext = depth;
      }
    },

    // [lookupOnContext]
    //
    // On stack, before: ...
    // On stack, after: currentContext[name], ...
    //
    // Looks up the value of `name` on the current context and pushes
    // it onto the stack.
    lookupOnContext: function(name) {
      this.push(this.nameLookup('depth' + this.lastContext, name, 'context'));
    },

    // [pushContext]
    //
    // On stack, before: ...
    // On stack, after: currentContext, ...
    //
    // Pushes the value of the current context onto the stack.
    pushContext: function() {
      this.pushStackLiteral('depth' + this.lastContext);
    },

    // [resolvePossibleLambda]
    //
    // On stack, before: value, ...
    // On stack, after: resolved value, ...
    //
    // If the `value` is a lambda, replace it on the stack by
    // the return value of the lambda
    resolvePossibleLambda: function() {
      this.context.aliases.functionType = '"function"';

      this.replaceStack(function(current) {
        return "typeof " + current + " === functionType ? " + current + ".apply(depth0) : " + current;
      });
    },

    // [lookup]
    //
    // On stack, before: value, ...
    // On stack, after: value[name], ...
    //
    // Replace the value on the stack with the result of looking
    // up `name` on `value`
    lookup: function(name) {
      this.replaceStack(function(current) {
        return current + " == null || " + current + " === false ? " + current + " : " + this.nameLookup(current, name, 'context');
      });
    },

    // [lookupData]
    //
    // On stack, before: ...
    // On stack, after: data, ...
    //
    // Push the data lookup operator
    lookupData: function() {
      this.push('data');
    },

    // [pushStringParam]
    //
    // On stack, before: ...
    // On stack, after: string, currentContext, ...
    //
    // This opcode is designed for use in string mode, which
    // provides the string value of a parameter along with its
    // depth rather than resolving it immediately.
    pushStringParam: function(string, type) {
      this.pushStackLiteral('depth' + this.lastContext);

      this.pushString(type);

      if (typeof string === 'string') {
        this.pushString(string);
      } else {
        this.pushStackLiteral(string);
      }
    },

    emptyHash: function() {
      this.pushStackLiteral('{}');

      if (this.options.stringParams) {
        this.register('hashTypes', '{}');
        this.register('hashContexts', '{}');
      }
    },
    pushHash: function() {
      this.hash = {values: [], types: [], contexts: []};
    },
    popHash: function() {
      var hash = this.hash;
      this.hash = undefined;

      if (this.options.stringParams) {
        this.register('hashContexts', '{' + hash.contexts.join(',') + '}');
        this.register('hashTypes', '{' + hash.types.join(',') + '}');
      }
      this.push('{\n    ' + hash.values.join(',\n    ') + '\n  }');
    },

    // [pushString]
    //
    // On stack, before: ...
    // On stack, after: quotedString(string), ...
    //
    // Push a quoted version of `string` onto the stack
    pushString: function(string) {
      this.pushStackLiteral(this.quotedString(string));
    },

    // [push]
    //
    // On stack, before: ...
    // On stack, after: expr, ...
    //
    // Push an expression onto the stack
    push: function(expr) {
      this.inlineStack.push(expr);
      return expr;
    },

    // [pushLiteral]
    //
    // On stack, before: ...
    // On stack, after: value, ...
    //
    // Pushes a value onto the stack. This operation prevents
    // the compiler from creating a temporary variable to hold
    // it.
    pushLiteral: function(value) {
      this.pushStackLiteral(value);
    },

    // [pushProgram]
    //
    // On stack, before: ...
    // On stack, after: program(guid), ...
    //
    // Push a program expression onto the stack. This takes
    // a compile-time guid and converts it into a runtime-accessible
    // expression.
    pushProgram: function(guid) {
      if (guid != null) {
        this.pushStackLiteral(this.programExpression(guid));
      } else {
        this.pushStackLiteral(null);
      }
    },

    // [invokeHelper]
    //
    // On stack, before: hash, inverse, program, params..., ...
    // On stack, after: result of helper invocation
    //
    // Pops off the helper's parameters, invokes the helper,
    // and pushes the helper's return value onto the stack.
    //
    // If the helper is not found, `helperMissing` is called.
    invokeHelper: function(paramSize, name) {
      this.context.aliases.helperMissing = 'helpers.helperMissing';

      var helper = this.lastHelper = this.setupHelper(paramSize, name, true);
      var nonHelper = this.nameLookup('depth' + this.lastContext, name, 'context');

      this.push(helper.name + ' || ' + nonHelper);
      this.replaceStack(function(name) {
        return name + ' ? ' + name + '.call(' +
            helper.callParams + ") " + ": helperMissing.call(" +
            helper.helperMissingParams + ")";
      });
    },

    // [invokeKnownHelper]
    //
    // On stack, before: hash, inverse, program, params..., ...
    // On stack, after: result of helper invocation
    //
    // This operation is used when the helper is known to exist,
    // so a `helperMissing` fallback is not required.
    invokeKnownHelper: function(paramSize, name) {
      var helper = this.setupHelper(paramSize, name);
      this.push(helper.name + ".call(" + helper.callParams + ")");
    },

    // [invokeAmbiguous]
    //
    // On stack, before: hash, inverse, program, params..., ...
    // On stack, after: result of disambiguation
    //
    // This operation is used when an expression like `{{foo}}`
    // is provided, but we don't know at compile-time whether it
    // is a helper or a path.
    //
    // This operation emits more code than the other options,
    // and can be avoided by passing the `knownHelpers` and
    // `knownHelpersOnly` flags at compile-time.
    invokeAmbiguous: function(name, helperCall) {
      this.context.aliases.functionType = '"function"';

      this.pushStackLiteral('{}');    // Hash value
      var helper = this.setupHelper(0, name, helperCall);

      var helperName = this.lastHelper = this.nameLookup('helpers', name, 'helper');

      var nonHelper = this.nameLookup('depth' + this.lastContext, name, 'context');
      var nextStack = this.nextStack();

      this.pushSource('if (' + nextStack + ' = ' + helperName + ') { ' + nextStack + ' = ' + nextStack + '.call(' + helper.callParams + '); }');
      this.pushSource('else { ' + nextStack + ' = ' + nonHelper + '; ' + nextStack + ' = typeof ' + nextStack + ' === functionType ? ' + nextStack + '.call(' + helper.callParams + ') : ' + nextStack + '; }');
    },

    // [invokePartial]
    //
    // On stack, before: context, ...
    // On stack after: result of partial invocation
    //
    // This operation pops off a context, invokes a partial with that context,
    // and pushes the result of the invocation back.
    invokePartial: function(name) {
      var params = [this.nameLookup('partials', name, 'partial'), "'" + name + "'", this.popStack(), "helpers", "partials"];

      if (this.options.data) {
        params.push("data");
      }

      this.context.aliases.self = "this";
      this.push("self.invokePartial(" + params.join(", ") + ")");
    },

    // [assignToHash]
    //
    // On stack, before: value, hash, ...
    // On stack, after: hash, ...
    //
    // Pops a value and hash off the stack, assigns `hash[key] = value`
    // and pushes the hash back onto the stack.
    assignToHash: function(key) {
      var value = this.popStack(),
          context,
          type;

      if (this.options.stringParams) {
        type = this.popStack();
        context = this.popStack();
      }

      var hash = this.hash;
      if (context) {
        hash.contexts.push("'" + key + "': " + context);
      }
      if (type) {
        hash.types.push("'" + key + "': " + type);
      }
      hash.values.push("'" + key + "': (" + value + ")");
    },

    // HELPERS

    compiler: JavaScriptCompiler,

    compileChildren: function(environment, options) {
      var children = environment.children, child, compiler;

      for(var i=0, l=children.length; i<l; i++) {
        child = children[i];
        compiler = new this.compiler();

        var index = this.matchExistingProgram(child);

        if (index == null) {
          this.context.programs.push('');     // Placeholder to prevent name conflicts for nested children
          index = this.context.programs.length;
          child.index = index;
          child.name = 'program' + index;
          this.context.programs[index] = compiler.compile(child, options, this.context);
          this.context.environments[index] = child;
        } else {
          child.index = index;
          child.name = 'program' + index;
        }
      }
    },
    matchExistingProgram: function(child) {
      for (var i = 0, len = this.context.environments.length; i < len; i++) {
        var environment = this.context.environments[i];
        if (environment && environment.equals(child)) {
          return i;
        }
      }
    },

    programExpression: function(guid) {
      this.context.aliases.self = "this";

      if(guid == null) {
        return "self.noop";
      }

      var child = this.environment.children[guid],
          depths = child.depths.list, depth;

      var programParams = [child.index, child.name, "data"];

      for(var i=0, l = depths.length; i<l; i++) {
        depth = depths[i];

        if(depth === 1) { programParams.push("depth0"); }
        else { programParams.push("depth" + (depth - 1)); }
      }

      return (depths.length === 0 ? "self.program(" : "self.programWithDepth(") + programParams.join(", ") + ")";
    },

    register: function(name, val) {
      this.useRegister(name);
      this.pushSource(name + " = " + val + ";");
    },

    useRegister: function(name) {
      if(!this.registers[name]) {
        this.registers[name] = true;
        this.registers.list.push(name);
      }
    },

    pushStackLiteral: function(item) {
      return this.push(new Literal(item));
    },

    pushSource: function(source) {
      if (this.pendingContent) {
        this.source.push(this.appendToBuffer(this.quotedString(this.pendingContent)));
        this.pendingContent = undefined;
      }

      if (source) {
        this.source.push(source);
      }
    },

    pushStack: function(item) {
      this.flushInline();

      var stack = this.incrStack();
      if (item) {
        this.pushSource(stack + " = " + item + ";");
      }
      this.compileStack.push(stack);
      return stack;
    },

    replaceStack: function(callback) {
      var prefix = '',
          inline = this.isInline(),
          stack;

      // If we are currently inline then we want to merge the inline statement into the
      // replacement statement via ','
      if (inline) {
        var top = this.popStack(true);

        if (top instanceof Literal) {
          // Literals do not need to be inlined
          stack = top.value;
        } else {
          // Get or create the current stack name for use by the inline
          var name = this.stackSlot ? this.topStackName() : this.incrStack();

          prefix = '(' + this.push(name) + ' = ' + top + '),';
          stack = this.topStack();
        }
      } else {
        stack = this.topStack();
      }

      var item = callback.call(this, stack);

      if (inline) {
        if (this.inlineStack.length || this.compileStack.length) {
          this.popStack();
        }
        this.push('(' + prefix + item + ')');
      } else {
        // Prevent modification of the context depth variable. Through replaceStack
        if (!/^stack/.test(stack)) {
          stack = this.nextStack();
        }

        this.pushSource(stack + " = (" + prefix + item + ");");
      }
      return stack;
    },

    nextStack: function() {
      return this.pushStack();
    },

    incrStack: function() {
      this.stackSlot++;
      if(this.stackSlot > this.stackVars.length) { this.stackVars.push("stack" + this.stackSlot); }
      return this.topStackName();
    },
    topStackName: function() {
      return "stack" + this.stackSlot;
    },
    flushInline: function() {
      var inlineStack = this.inlineStack;
      if (inlineStack.length) {
        this.inlineStack = [];
        for (var i = 0, len = inlineStack.length; i < len; i++) {
          var entry = inlineStack[i];
          if (entry instanceof Literal) {
            this.compileStack.push(entry);
          } else {
            this.pushStack(entry);
          }
        }
      }
    },
    isInline: function() {
      return this.inlineStack.length;
    },

    popStack: function(wrapped) {
      var inline = this.isInline(),
          item = (inline ? this.inlineStack : this.compileStack).pop();

      if (!wrapped && (item instanceof Literal)) {
        return item.value;
      } else {
        if (!inline) {
          this.stackSlot--;
        }
        return item;
      }
    },

    topStack: function(wrapped) {
      var stack = (this.isInline() ? this.inlineStack : this.compileStack),
          item = stack[stack.length - 1];

      if (!wrapped && (item instanceof Literal)) {
        return item.value;
      } else {
        return item;
      }
    },

    quotedString: function(str) {
      return '"' + str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\u2028/g, '\\u2028')   // Per Ecma-262 7.3 + 7.8.4
        .replace(/\u2029/g, '\\u2029') + '"';
    },

    setupHelper: function(paramSize, name, missingParams) {
      var params = [];
      this.setupParams(paramSize, params, missingParams);
      var foundHelper = this.nameLookup('helpers', name, 'helper');

      return {
        params: params,
        name: foundHelper,
        callParams: ["depth0"].concat(params).join(", "),
        helperMissingParams: missingParams && ["depth0", this.quotedString(name)].concat(params).join(", ")
      };
    },

    // the params and contexts arguments are passed in arrays
    // to fill in
    setupParams: function(paramSize, params, useRegister) {
      var options = [], contexts = [], types = [], param, inverse, program;

      options.push("hash:" + this.popStack());

      inverse = this.popStack();
      program = this.popStack();

      // Avoid setting fn and inverse if neither are set. This allows
      // helpers to do a check for `if (options.fn)`
      if (program || inverse) {
        if (!program) {
          this.context.aliases.self = "this";
          program = "self.noop";
        }

        if (!inverse) {
         this.context.aliases.self = "this";
          inverse = "self.noop";
        }

        options.push("inverse:" + inverse);
        options.push("fn:" + program);
      }

      for(var i=0; i<paramSize; i++) {
        param = this.popStack();
        params.push(param);

        if(this.options.stringParams) {
          types.push(this.popStack());
          contexts.push(this.popStack());
        }
      }

      if (this.options.stringParams) {
        options.push("contexts:[" + contexts.join(",") + "]");
        options.push("types:[" + types.join(",") + "]");
        options.push("hashContexts:hashContexts");
        options.push("hashTypes:hashTypes");
      }

      if(this.options.data) {
        options.push("data:data");
      }

      options = "{" + options.join(",") + "}";
      if (useRegister) {
        this.register('options', options);
        params.push('options');
      } else {
        params.push(options);
      }
      return params.join(", ");
    }
  };

  var reservedWords = (
    "break else new var" +
    " case finally return void" +
    " catch for switch while" +
    " continue function this with" +
    " default if throw" +
    " delete in try" +
    " do instanceof typeof" +
    " abstract enum int short" +
    " boolean export interface static" +
    " byte extends long super" +
    " char final native synchronized" +
    " class float package throws" +
    " const goto private transient" +
    " debugger implements protected volatile" +
    " double import public let yield"
  ).split(" ");

  var compilerWords = JavaScriptCompiler.RESERVED_WORDS = {};

  for(var i=0, l=reservedWords.length; i<l; i++) {
    compilerWords[reservedWords[i]] = true;
  }

  JavaScriptCompiler.isValidJavaScriptVariableName = function(name) {
    if(!JavaScriptCompiler.RESERVED_WORDS[name] && /^[a-zA-Z_$][0-9a-zA-Z_$]+$/.test(name)) {
      return true;
    }
    return false;
  };

  __exports__ = JavaScriptCompiler;
  return __exports__;
})(__module2__);

// handlebars/compiler/compiler.js
var __module10__ = (function(__dependency1__, __dependency2__, __dependency3__, __dependency4__) {
  "use strict";
  var __exports__ = {};
  var Exception = __dependency1__;
  var parse = __dependency2__.parse;
  var JavaScriptCompiler = __dependency3__;
  var AST = __dependency4__;

  function Compiler() {}

  __exports__.Compiler = Compiler;// the foundHelper register will disambiguate helper lookup from finding a
  // function in a context. This is necessary for mustache compatibility, which
  // requires that context functions in blocks are evaluated by blockHelperMissing,
  // and then proceed as if the resulting value was provided to blockHelperMissing.

  Compiler.prototype = {
    compiler: Compiler,

    disassemble: function() {
      var opcodes = this.opcodes, opcode, out = [], params, param;

      for (var i=0, l=opcodes.length; i<l; i++) {
        opcode = opcodes[i];

        if (opcode.opcode === 'DECLARE') {
          out.push("DECLARE " + opcode.name + "=" + opcode.value);
        } else {
          params = [];
          for (var j=0; j<opcode.args.length; j++) {
            param = opcode.args[j];
            if (typeof param === "string") {
              param = "\"" + param.replace("\n", "\\n") + "\"";
            }
            params.push(param);
          }
          out.push(opcode.opcode + " " + params.join(" "));
        }
      }

      return out.join("\n");
    },

    equals: function(other) {
      var len = this.opcodes.length;
      if (other.opcodes.length !== len) {
        return false;
      }

      for (var i = 0; i < len; i++) {
        var opcode = this.opcodes[i],
            otherOpcode = other.opcodes[i];
        if (opcode.opcode !== otherOpcode.opcode || opcode.args.length !== otherOpcode.args.length) {
          return false;
        }
        for (var j = 0; j < opcode.args.length; j++) {
          if (opcode.args[j] !== otherOpcode.args[j]) {
            return false;
          }
        }
      }

      len = this.children.length;
      if (other.children.length !== len) {
        return false;
      }
      for (i = 0; i < len; i++) {
        if (!this.children[i].equals(other.children[i])) {
          return false;
        }
      }

      return true;
    },

    guid: 0,

    compile: function(program, options) {
      this.opcodes = [];
      this.children = [];
      this.depths = {list: []};
      this.options = options;

      // These changes will propagate to the other compiler components
      var knownHelpers = this.options.knownHelpers;
      this.options.knownHelpers = {
        'helperMissing': true,
        'blockHelperMissing': true,
        'each': true,
        'if': true,
        'unless': true,
        'with': true,
        'log': true
      };
      if (knownHelpers) {
        for (var name in knownHelpers) {
          this.options.knownHelpers[name] = knownHelpers[name];
        }
      }

      return this.accept(program);
    },

    accept: function(node) {
      var strip = node.strip || {},
          ret;
      if (strip.left) {
        this.opcode('strip');
      }

      ret = this[node.type](node);

      if (strip.right) {
        this.opcode('strip');
      }

      return ret;
    },

    program: function(program) {
      var statements = program.statements;

      for(var i=0, l=statements.length; i<l; i++) {
        this.accept(statements[i]);
      }
      this.isSimple = l === 1;

      this.depths.list = this.depths.list.sort(function(a, b) {
        return a - b;
      });

      return this;
    },

    compileProgram: function(program) {
      var result = new this.compiler().compile(program, this.options);
      var guid = this.guid++, depth;

      this.usePartial = this.usePartial || result.usePartial;

      this.children[guid] = result;

      for(var i=0, l=result.depths.list.length; i<l; i++) {
        depth = result.depths.list[i];

        if(depth < 2) { continue; }
        else { this.addDepth(depth - 1); }
      }

      return guid;
    },

    block: function(block) {
      var mustache = block.mustache,
          program = block.program,
          inverse = block.inverse;

      if (program) {
        program = this.compileProgram(program);
      }

      if (inverse) {
        inverse = this.compileProgram(inverse);
      }

      var type = this.classifyMustache(mustache);

      if (type === "helper") {
        this.helperMustache(mustache, program, inverse);
      } else if (type === "simple") {
        this.simpleMustache(mustache);

        // now that the simple mustache is resolved, we need to
        // evaluate it by executing `blockHelperMissing`
        this.opcode('pushProgram', program);
        this.opcode('pushProgram', inverse);
        this.opcode('emptyHash');
        this.opcode('blockValue');
      } else {
        this.ambiguousMustache(mustache, program, inverse);

        // now that the simple mustache is resolved, we need to
        // evaluate it by executing `blockHelperMissing`
        this.opcode('pushProgram', program);
        this.opcode('pushProgram', inverse);
        this.opcode('emptyHash');
        this.opcode('ambiguousBlockValue');
      }

      this.opcode('append');
    },

    hash: function(hash) {
      var pairs = hash.pairs, pair, val;

      this.opcode('pushHash');

      for(var i=0, l=pairs.length; i<l; i++) {
        pair = pairs[i];
        val  = pair[1];

        if (this.options.stringParams) {
          if(val.depth) {
            this.addDepth(val.depth);
          }
          this.opcode('getContext', val.depth || 0);
          this.opcode('pushStringParam', val.stringModeValue, val.type);
        } else {
          this.accept(val);
        }

        this.opcode('assignToHash', pair[0]);
      }
      this.opcode('popHash');
    },

    partial: function(partial) {
      var partialName = partial.partialName;
      this.usePartial = true;

      if(partial.context) {
        this.ID(partial.context);
      } else {
        this.opcode('push', 'depth0');
      }

      this.opcode('invokePartial', partialName.name);
      this.opcode('append');
    },

    content: function(content) {
      this.opcode('appendContent', content.string);
    },

    mustache: function(mustache) {
      var options = this.options;
      var type = this.classifyMustache(mustache);

      if (type === "simple") {
        this.simpleMustache(mustache);
      } else if (type === "helper") {
        this.helperMustache(mustache);
      } else {
        this.ambiguousMustache(mustache);
      }

      if(mustache.escaped && !options.noEscape) {
        this.opcode('appendEscaped');
      } else {
        this.opcode('append');
      }
    },

    ambiguousMustache: function(mustache, program, inverse) {
      var id = mustache.id,
          name = id.parts[0],
          isBlock = program != null || inverse != null;

      this.opcode('getContext', id.depth);

      this.opcode('pushProgram', program);
      this.opcode('pushProgram', inverse);

      this.opcode('invokeAmbiguous', name, isBlock);
    },

    simpleMustache: function(mustache) {
      var id = mustache.id;

      if (id.type === 'DATA') {
        this.DATA(id);
      } else if (id.parts.length) {
        this.ID(id);
      } else {
        // Simplified ID for `this`
        this.addDepth(id.depth);
        this.opcode('getContext', id.depth);
        this.opcode('pushContext');
      }

      this.opcode('resolvePossibleLambda');
    },

    helperMustache: function(mustache, program, inverse) {
      var params = this.setupFullMustacheParams(mustache, program, inverse),
          name = mustache.id.parts[0];

      if (this.options.knownHelpers[name]) {
        this.opcode('invokeKnownHelper', params.length, name);
      } else if (this.options.knownHelpersOnly) {
        throw new Error("You specified knownHelpersOnly, but used the unknown helper " + name);
      } else {
        this.opcode('invokeHelper', params.length, name);
      }
    },

    ID: function(id) {
      this.addDepth(id.depth);
      this.opcode('getContext', id.depth);

      var name = id.parts[0];
      if (!name) {
        this.opcode('pushContext');
      } else {
        this.opcode('lookupOnContext', id.parts[0]);
      }

      for(var i=1, l=id.parts.length; i<l; i++) {
        this.opcode('lookup', id.parts[i]);
      }
    },

    DATA: function(data) {
      this.options.data = true;
      if (data.id.isScoped || data.id.depth) {
        throw new Exception('Scoped data references are not supported: ' + data.original);
      }

      this.opcode('lookupData');
      var parts = data.id.parts;
      for(var i=0, l=parts.length; i<l; i++) {
        this.opcode('lookup', parts[i]);
      }
    },

    STRING: function(string) {
      this.opcode('pushString', string.string);
    },

    INTEGER: function(integer) {
      this.opcode('pushLiteral', integer.integer);
    },

    BOOLEAN: function(bool) {
      this.opcode('pushLiteral', bool.bool);
    },

    comment: function() {},

    // HELPERS
    opcode: function(name) {
      this.opcodes.push({ opcode: name, args: [].slice.call(arguments, 1) });
    },

    declare: function(name, value) {
      this.opcodes.push({ opcode: 'DECLARE', name: name, value: value });
    },

    addDepth: function(depth) {
      if(isNaN(depth)) { throw new Error("EWOT"); }
      if(depth === 0) { return; }

      if(!this.depths[depth]) {
        this.depths[depth] = true;
        this.depths.list.push(depth);
      }
    },

    classifyMustache: function(mustache) {
      var isHelper   = mustache.isHelper;
      var isEligible = mustache.eligibleHelper;
      var options    = this.options;

      // if ambiguous, we can possibly resolve the ambiguity now
      if (isEligible && !isHelper) {
        var name = mustache.id.parts[0];

        if (options.knownHelpers[name]) {
          isHelper = true;
        } else if (options.knownHelpersOnly) {
          isEligible = false;
        }
      }

      if (isHelper) { return "helper"; }
      else if (isEligible) { return "ambiguous"; }
      else { return "simple"; }
    },

    pushParams: function(params) {
      var i = params.length, param;

      while(i--) {
        param = params[i];

        if(this.options.stringParams) {
          if(param.depth) {
            this.addDepth(param.depth);
          }

          this.opcode('getContext', param.depth || 0);
          this.opcode('pushStringParam', param.stringModeValue, param.type);
        } else {
          this[param.type](param);
        }
      }
    },

    setupMustacheParams: function(mustache) {
      var params = mustache.params;
      this.pushParams(params);

      if(mustache.hash) {
        this.hash(mustache.hash);
      } else {
        this.opcode('emptyHash');
      }

      return params;
    },

    // this will replace setupMustacheParams when we're done
    setupFullMustacheParams: function(mustache, program, inverse) {
      var params = mustache.params;
      this.pushParams(params);

      this.opcode('pushProgram', program);
      this.opcode('pushProgram', inverse);

      if(mustache.hash) {
        this.hash(mustache.hash);
      } else {
        this.opcode('emptyHash');
      }

      return params;
    }
  };

  function precompile(input, options) {
    if (input == null || (typeof input !== 'string' && input.constructor !== AST.ProgramNode)) {
      throw new Exception("You must pass a string or Handlebars AST to Handlebars.precompile. You passed " + input);
    }

    options = options || {};
    if (!('data' in options)) {
      options.data = true;
    }

    var ast = parse(input);
    var environment = new Compiler().compile(ast, options);
    return new JavaScriptCompiler().compile(environment, options);
  }

  __exports__.precompile = precompile;function compile(input, options, env) {
    if (input == null || (typeof input !== 'string' && input.constructor !== AST.ProgramNode)) {
      throw new Exception("You must pass a string or Handlebars AST to Handlebars.compile. You passed " + input);
    }

    options = options || {};

    if (!('data' in options)) {
      options.data = true;
    }

    var compiled;

    function compileInput() {
      var ast = parse(input);
      var environment = new Compiler().compile(ast, options);
      var templateSpec = new JavaScriptCompiler().compile(environment, options, undefined, true);
      return env.template(templateSpec);
    }

    // Template is only compiled on first use and cached after that point.
    return function(context, options) {
      if (!compiled) {
        compiled = compileInput();
      }
      return compiled.call(this, context, options);
    };
  }

  __exports__.compile = compile;
  return __exports__;
})(__module5__, __module8__, __module11__, __module7__);

// handlebars.js
var __module0__ = (function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__) {
  "use strict";
  var __exports__;
  /*globals Handlebars: true */
  var Handlebars = __dependency1__;

  // Compiler imports
  var AST = __dependency2__;
  var Parser = __dependency3__.parser;
  var parse = __dependency3__.parse;
  var Compiler = __dependency4__.Compiler;
  var compile = __dependency4__.compile;
  var precompile = __dependency4__.precompile;
  var JavaScriptCompiler = __dependency5__;

  var _create = Handlebars.create;
  var create = function() {
    var hb = _create();

    hb.compile = function(input, options) {
      return compile(input, options, hb);
    };
    hb.precompile = precompile;

    hb.AST = AST;
    hb.Compiler = Compiler;
    hb.JavaScriptCompiler = JavaScriptCompiler;
    hb.Parser = Parser;
    hb.parse = parse;

    return hb;
  };

  Handlebars = create();
  Handlebars.create = create;

  __exports__ = Handlebars;
  return __exports__;
})(__module1__, __module7__, __module8__, __module10__, __module11__);

  return __module0__;
})();

define("handlebars", (function (global) {
    return function () {
        var ret, fn;
        return ret || global.Handlebars;
    };
}(this)));

define('templates/coding-rules',['handlebars'], function(Handlebars) {

this["SS"] = this["SS"] || {};
this["SS"]["Templates"] = this["SS"]["Templates"] || {};

Handlebars.registerPartial("_markdown-tips", Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  buffer += "<div class=\"markdown-tips\">\n  <a href=\"#\" onclick=\"window.open(baseUrl + '/markdown/help','markdown','height=300,width=600,scrollbars=1,resizable=1');return false;\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "markdown.helplink", options) : helperMissing.call(depth0, "t", "markdown.helplink", options)))
    + "</a> :\n  &nbsp; *"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "bold", options) : helperMissing.call(depth0, "t", "bold", options)))
    + "* &nbsp;&nbsp; ``"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "code", options) : helperMissing.call(depth0, "t", "code", options)))
    + "`` &nbsp;&nbsp; * "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "bulleted_point", options) : helperMissing.call(depth0, "t", "bulleted_point", options)))
    + "\n</div>\n";
  return buffer;
  }));

this["SS"]["Templates"]["coding-rules-actions"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.ordered_by", options) : helperMissing.call(depth0, "t", "coding_rules.ordered_by", options)))
    + " <strong class=\"navigator-actions-ordered-by\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.sorting)),stack1 == null || stack1 === false ? stack1 : stack1.sortText)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</strong> ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.sorting)),stack1 == null || stack1 === false ? stack1 : stack1.asc), {hash:{},inverse:self.program(4, program4, data),fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  return buffer;
  }
function program2(depth0,data) {
  
  
  return "<i class=\"icon-sort-asc\"></i>";
  }

function program4(depth0,data) {
  
  
  return "<i class=\"icon-sort-desc\"></i>";
  }

function program6(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.order", options) : helperMissing.call(depth0, "t", "coding_rules.order", options)))
    + "\n  ";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<a class=\"navigator-actions-bulk icon-bulk-change\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "bulk_change", options) : helperMissing.call(depth0, "t", "bulk_change", options)))
    + "\"></a>";
  return buffer;
  }

  buffer += "<div class=\"navigator-actions-order\">\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.sorting), {hash:{},inverse:self.program(6, program6, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n<ul class=\"navigator-actions-order-choices\">\n  <li data-sort=\"\" data-asc=\"\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.sort.relevance", options) : helperMissing.call(depth0, "t", "coding_rules.sort.relevance", options)))
    + "</li>\n  <li data-sort=\"createdAt\" data-asc=\"true\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.sort.creation_date", options) : helperMissing.call(depth0, "t", "coding_rules.sort.creation_date", options)))
    + " <i class=\"icon-sort-asc\"></i></li>\n  <li data-sort=\"createdAt\" data-asc=\"false\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.sort.creation_date", options) : helperMissing.call(depth0, "t", "coding_rules.sort.creation_date", options)))
    + " <i class=\"icon-sort-desc\"></i></li>\n  <li data-sort=\"name\" data-asc=\"true\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.sort.name", options) : helperMissing.call(depth0, "t", "coding_rules.sort.name", options)))
    + " <i class=\"icon-sort-asc\"></i></li>\n  <li data-sort=\"name\" data-asc=\"false\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.sort.name", options) : helperMissing.call(depth0, "t", "coding_rules.sort.name", options)))
    + " <i class=\"icon-sort-desc\"></i></li>\n</ul>\n<div class=\"navigator-actions-total\">\n  "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.found", options) : helperMissing.call(depth0, "t", "coding_rules.found", options)))
    + ": <strong>"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.paging)),stack1 == null || stack1 === false ? stack1 : stack1.total)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</strong>\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(8, program8, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-bulk-change-dropdown"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <a class=\"coding-rules-bulk-change-dropdown-link\" data-action=\"activate\" data-param=\"";
  if (helper = helpers.qualityProfile) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.qualityProfile); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n    "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate_in", options) : helperMissing.call(depth0, "t", "coding_rules.activate_in", options)))
    + " <strong>";
  if (helper = helpers.qualityProfileName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.qualityProfileName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</strong>\n  </a>\n";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <a class=\"coding-rules-bulk-change-dropdown-link\" data-action=\"deactivate\" data-param=\"";
  if (helper = helpers.qualityProfile) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.qualityProfile); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n    "
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.deactivate_in", options) : helperMissing.call(depth0, "tp", "coding_rules.deactivate_in", options)))
    + " <strong>";
  if (helper = helpers.qualityProfileName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.qualityProfileName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</strong>\n  </a>\n";
  return buffer;
  }

  buffer += "\n\n<a class=\"coding-rules-bulk-change-dropdown-link\" data-action=\"activate\">\n  "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate_in", options) : helperMissing.call(depth0, "t", "coding_rules.activate_in", options)))
    + "&#8230;\n</a>\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.allowActivateOnProfile), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n\n\n\n<a class=\"coding-rules-bulk-change-dropdown-link\" data-action=\"deactivate\">\n  "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.deactivate_in", options) : helperMissing.call(depth0, "t", "coding_rules.deactivate_in", options)))
    + "&#8230;\n</a>\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.allowDeactivateOnProfile), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-bulk-change"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate_in_quality_profile", options) : helperMissing.call(depth0, "t", "coding_rules.activate_in_quality_profile", options)))
    + " ("
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.paging)),stack1 == null || stack1 === false ? stack1 : stack1.total)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + " "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules._rules", options) : helperMissing.call(depth0, "t", "coding_rules._rules", options)))
    + ")</h2>\n    ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.deactivate_in_quality_profile", options) : helperMissing.call(depth0, "t", "coding_rules.deactivate_in_quality_profile", options)))
    + " ("
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.paging)),stack1 == null || stack1 === false ? stack1 : stack1.total)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + " "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules._rules", options) : helperMissing.call(depth0, "t", "coding_rules._rules", options)))
    + ")</h2>\n    ";
  return buffer;
  }

function program5(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.change_severity_in", options) : helperMissing.call(depth0, "t", "coding_rules.change_severity_in", options)));
  }

function program7(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate_in", options) : helperMissing.call(depth0, "t", "coding_rules.activate_in", options)));
  }

function program9(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.deactivate_in", options) : helperMissing.call(depth0, "t", "coding_rules.deactivate_in", options)));
  }

function program11(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <h3 class=\"readonly-field\">";
  if (helper = helpers.qualityProfileName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.qualityProfileName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1);
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.action), "change-severity", options) : helperMissing.call(depth0, "notEq", (depth0 && depth0.action), "change-severity", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</h3>\n      ";
  return buffer;
  }
function program12(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += " —\n          "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "are_you_sure", options) : helperMissing.call(depth0, "t", "are_you_sure", options)));
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n        <select id=\"coding-rules-bulk-change-profile\">\n          ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.availableQualityProfiles), {hash:{},inverse:self.noop,fn:self.program(15, program15, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </select>\n      ";
  return buffer;
  }
function program15(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            <option value=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + " - ";
  if (helper = helpers.language) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.language); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</option>\n          ";
  return buffer;
  }

  buffer += "<form>\n  <div class=\"modal-head\">\n    ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.action), "activate", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.action), "activate", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.action), "deactivate", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.action), "deactivate", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n\n  <div class=\"modal-body modal-body-select2\">\n    <div class=\"modal-error\"></div>\n    <div class=\"modal-warning\"></div>\n    <div class=\"modal-notice\"></div>\n\n    <div class=\"modal-field\">\n      <h3><label for=\"coding-rules-bulk-change-profile\">\n        ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.action), "change-severity", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.action), "change-severity", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(7, program7, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.action), "activate", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.action), "activate", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(9, program9, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.action), "deactivate", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.action), "deactivate", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </label></h3>\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.qualityProfile), {hash:{},inverse:self.program(14, program14, data),fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </div>\n  </div>\n\n  <div class=\"modal-foot\">\n    <button id=\"coding-rules-submit-bulk-change\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "apply", options) : helperMissing.call(depth0, "t", "apply", options)))
    + "</button>\n    <a id=\"coding-rules-cancel-bulk-change\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n    <a id=\"coding-rules-close-bulk-change\" class=\"action\" style=\"display:none\" href=\"#\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "close", options) : helperMissing.call(depth0, "t", "close", options)))
    + "</a>\n  </div>\n</form>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-custom-rule-creation"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); partials = this.merge(partials, Handlebars.partials); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.update_custom_rule", options) : helperMissing.call(depth0, "t", "coding_rules.update_custom_rule", options)))
    + "</h2>\n    ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.create_custom_rule", options) : helperMissing.call(depth0, "t", "coding_rules.create_custom_rule", options)))
    + "</h2>\n    ";
  return buffer;
  }

function program5(depth0,data) {
  
  
  return " <em class=\"mandatory\">*</em>";
  }

function program7(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            <span class=\"coding-rules-detail-custom-rule-key\" title=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          ";
  return buffer;
  }

function program9(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            <input type=\"text\" name=\"key\" id=\"coding-rules-custom-rule-creation-key\"\n              class=\"coding-rules-name-key\" value=\"";
  if (helper = helpers.internalKey) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.internalKey); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"/>\n          ";
  return buffer;
  }

function program11(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n              <option value=\""
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", depth0, options) : helperMissing.call(depth0, "t", "severity", depth0, options)))
    + "</option>\n            ";
  return buffer;
  }

function program13(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <option value=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.text) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.text); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</option>\n            ";
  return buffer;
  }

function program15(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <tr class=\"property\">\n          <th><h3>";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</h3></th>\n          <td>\n            ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.program(18, program18, data),fn:self.program(16, program16, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.type), "TEXT", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.type), "TEXT", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            <div class=\"note\">";
  if (helper = helpers.description) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.description); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n            ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.extra), {hash:{},inverse:self.noop,fn:self.program(20, program20, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </td>\n        </tr>\n      ";
  return buffer;
  }
function program16(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <textarea class=\"width100\" rows=\"3\" name=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" placeholder=\"";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</textarea>\n            ";
  return buffer;
  }

function program18(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <input type=\"text\" name=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" value=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" placeholder=\"";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"/>\n            ";
  return buffer;
  }

function program20(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <div class=\"note\">";
  if (helper = helpers.extra) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.extra); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n            ";
  return buffer;
  }

function program22(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)));
  }

function program24(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "create", options) : helperMissing.call(depth0, "t", "create", options)));
  }

  buffer += "<form>\n  <div class=\"modal-head\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n\n  <div class=\"modal-body\">\n    <div class=\"modal-error\"></div>\n    <div class=\"modal-warning\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.reactivate.help", options) : helperMissing.call(depth0, "t", "coding_rules.reactivate.help", options)))
    + "</div>\n\n    <table>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "name", options) : helperMissing.call(depth0, "t", "name", options)))
    + " <em class=\"mandatory\">*</em></h3></th>\n        <td>\n          <input type=\"text\" name=\"name\" id=\"coding-rules-custom-rule-creation-name\"\n            class=\"coding-rules-name-key\" value=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"/>\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "key", options) : helperMissing.call(depth0, "t", "key", options)));
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</h3></th>\n        <td>\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "description", options) : helperMissing.call(depth0, "t", "description", options)))
    + " <em class=\"mandatory\">*</em></h3></th>\n        <td>\n          <textarea type=\"textarea\" name=\"markdown_description\" id=\"coding-rules-custom-rule-creation-html-description\"\n            class=\"coding-rules-markdown-description\" rows=\"15\">";
  if (helper = helpers.mdDesc) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.mdDesc); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</textarea>\n          <span class=\"right\">";
  stack1 = self.invokePartial(partials['_markdown-tips'], '_markdown-tips', depth0, helpers, partials, data);
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</span>\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", options) : helperMissing.call(depth0, "t", "severity", options)))
    + "</h3></th>\n        <td>\n          <select id=\"coding-rules-custom-rule-creation-severity\">\n            ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.severities), {hash:{},inverse:self.noop,fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </select>\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.filters.status", options) : helperMissing.call(depth0, "t", "coding_rules.filters.status", options)))
    + "</h3></th>\n        <td>\n          <select id=\"coding-rules-custom-rule-creation-status\">\n            ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.statuses), {hash:{},inverse:self.noop,fn:self.program(13, program13, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </select>\n        </td>\n      </tr>\n      ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.params), {hash:{},inverse:self.noop,fn:self.program(15, program15, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </table>\n  </div>\n\n  <div class=\"modal-foot\">\n    <button id=\"coding-rules-custom-rule-creation-create\">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(24, program24, data),fn:self.program(22, program22, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </button>\n    <a id=\"coding-rules-custom-rule-creation-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n  </div>\n</form>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-custom-rule-reactivation"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)));
  }

function program3(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "create", options) : helperMissing.call(depth0, "t", "create", options)));
  }

  buffer += "<button id=\"coding-rules-custom-rule-creation-reactivate\">\n  "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.reactivate", options) : helperMissing.call(depth0, "t", "coding_rules.reactivate", options)))
    + "\n</button>\n<button id=\"coding-rules-custom-rule-creation-create\">\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</button>\n<a id=\"coding-rules-custom-rule-creation-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-debt-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <li>\n      <h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.remediation_function", options) : helperMissing.call(depth0, "t", "coding_rules.remediation_function", options)))
    + "</h3>\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.remediation_function", (depth0 && depth0.debtRemFnType), options) : helperMissing.call(depth0, "t", "coding_rules.remediation_function", (depth0 && depth0.debtRemFnType), options)))
    + "\n    </li>\n    ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <li>\n      <h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.remediation_function.coeff", options) : helperMissing.call(depth0, "t", "coding_rules.remediation_function.coeff", options)))
    + "</h3>\n      ";
  if (helper = helpers.debtRemFnCoeff) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.debtRemFnCoeff); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n    </li>\n    ";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <li>\n      <h3>";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.program(8, program8, data),fn:self.program(6, program6, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.debtRemFnType), "CONSTANT_ISSUE", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.debtRemFnType), "CONSTANT_ISSUE", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </h3>\n      ";
  if (helper = helpers.debtRemFnOffset) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.debtRemFnOffset); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n    </li>\n    ";
  return buffer;
  }
function program6(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.remediation_function.constant", options) : helperMissing.call(depth0, "t", "coding_rules.remediation_function.constant", options)))
    + "\n        ";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.remediation_function.offset", options) : helperMissing.call(depth0, "t", "coding_rules.remediation_function.offset", options)))
    + "\n        ";
  return buffer;
  }

  buffer += "<div class=\"coding-rules-debt-popup bubble-popup-container\">\n  <ul class=\"bubble-popup-list\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.debtRemFnType), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.debtRemFnCoeff), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.debtRemFnOffset), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-detail-custom-rule"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <div class=\"coding-rules-detail-custom-rule-parameter\">\n      <span class=\"key\">";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span><span class=\"sep\">:&nbsp;</span><span class=\"value\" title=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n    </div>\n  ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n<td class=\"coding-rules-detail-custom-rule-actions\">\n  <div class=\"button-group\">\n    <button class=\"coding-rules-detail-custom-rule-delete button-red\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "delete", options) : helperMissing.call(depth0, "t", "delete", options)))
    + "\n    </button>\n  </div>\n</td>\n";
  return buffer;
  }

  buffer += "<td class=\"coding-rules-detail-custom-rule-name\">\n  <a class=\"nolink\" href=\"#rule_key=";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</a>\n</td>\n\n<td class=\"coding-rules-detail-custom-rule-severity\">\n  "
    + escapeExpression((helper = helpers.severityIcon || (depth0 && depth0.severityIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.severity), options) : helperMissing.call(depth0, "severityIcon", (depth0 && depth0.severity), options)))
    + " "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", (depth0 && depth0.severity), options) : helperMissing.call(depth0, "t", "severity", (depth0 && depth0.severity), options)))
    + "\n</td>\n\n<td class=\"coding-rules-detail-custom-rule-parameters\">\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.parameters), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  &nbsp;\n</td>\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-detail-quality-profile"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this, functionType="function";

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"coding-rules-detail-quality-profile-inheritance\">\n          ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.inherit), "OVERRIDES", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.inherit), "OVERRIDES", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.inherit), "INHERITED", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.inherit), "INHERITED", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n        </div>\n      ";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <i class=\"icon-inheritance\" title=\""
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.overrides", (depth0 && depth0.name), ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.name), options) : helperMissing.call(depth0, "tp", "coding_rules.overrides", (depth0 && depth0.name), ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.name), options)))
    + "\"></i>\n          ";
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <i class=\"icon-inheritance\" title=\""
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.inherits", (depth0 && depth0.name), ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.name), options) : helperMissing.call(depth0, "tp", "coding_rules.inherits", (depth0 && depth0.name), ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.name), options)))
    + "\"></i>\n          ";
  return buffer;
  }

function program6(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <td class=\"coding-rules-detail-quality-profile-severity\">\n        "
    + escapeExpression((helper = helpers.severityIcon || (depth0 && depth0.severityIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.severity), options) : helperMissing.call(depth0, "severityIcon", (depth0 && depth0.severity), options)))
    + " "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", (depth0 && depth0.severity), options) : helperMissing.call(depth0, "t", "severity", (depth0 && depth0.severity), options)))
    + "\n        ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.parent), {hash:{},inverse:self.noop,fn:self.program(7, program7, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </td>\n\n      ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.templateKey), {hash:{},inverse:self.noop,fn:self.program(10, program10, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(15, program15, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  return buffer;
  }
function program7(depth0,data) {
  
  var stack1, helper, options;
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(8, program8, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.severity), ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.severity), options) : helperMissing.call(depth0, "notEq", (depth0 && depth0.severity), ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.severity), options));
  if(stack1 || stack1 === 0) { return stack1; }
  else { return ''; }
  }
function program8(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <div class=\"coding-rules-detail-quality-profile-inheritance\">\n            "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.original", options) : helperMissing.call(depth0, "t", "coding_rules.original", options)))
    + "&nbsp;"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.severity), options) : helperMissing.call(depth0, "t", "severity", ((stack1 = (depth0 && depth0.parent)),stack1 == null || stack1 === false ? stack1 : stack1.severity), options)))
    + "\n          </div>\n        ";
  return buffer;
  }

function program10(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      <td class=\"coding-rules-detail-quality-profile-parameters\">\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.parameters), {hash:{},inverse:self.noop,fn:self.programWithDepth(11, program11, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        &nbsp;\n      </td>\n      ";
  return buffer;
  }
function program11(depth0,data,depth1) {
  
  var buffer = "", stack1, helper;
  buffer += "\n          <div class=\"coding-rules-detail-quality-profile-parameter\">\n            <span class=\"key\">";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span><span class=\"sep\">:&nbsp;</span><span class=\"value\" title=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            ";
  stack1 = helpers['if'].call(depth0, (depth1 && depth1.parent), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </div>\n        ";
  return buffer;
  }
function program12(depth0,data) {
  
  var stack1, helper, options;
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(13, program13, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.value), (depth0 && depth0.original), options) : helperMissing.call(depth0, "notEq", (depth0 && depth0.value), (depth0 && depth0.original), options));
  if(stack1 || stack1 === 0) { return stack1; }
  else { return ''; }
  }
function program13(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n              <div class=\"coding-rules-detail-quality-profile-inheritance\">\n                "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.original", options) : helperMissing.call(depth0, "t", "coding_rules.original", options)))
    + "&nbsp;<span class=\"value\">";
  if (helper = helpers.original) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.original); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n              </div>\n            ";
  return buffer;
  }

function program15(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      <td class=\"coding-rules-detail-quality-profile-actions\">\n        <div class=\"button-group\">\n          ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isTemplate), {hash:{},inverse:self.noop,fn:self.program(16, program16, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.parent), {hash:{},inverse:self.program(21, program21, data),fn:self.program(18, program18, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </div>\n      </td>\n      ";
  return buffer;
  }
function program16(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            <button class=\"coding-rules-detail-quality-profile-change\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "change_verb", options) : helperMissing.call(depth0, "t", "change_verb", options)))
    + "</button>\n          ";
  return buffer;
  }

function program18(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(19, program19, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.inherit), "OVERRIDES", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.inherit), "OVERRIDES", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }
function program19(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            <button class=\"coding-rules-detail-quality-profile-revert button-red\">\n              "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.revert_to_parent_definition", options) : helperMissing.call(depth0, "t", "coding_rules.revert_to_parent_definition", options)))
    + "\n            </button>\n            ";
  return buffer;
  }

function program21(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            <button class=\"coding-rules-detail-quality-profile-deactivate button-red\">\n              "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.deactivate", options) : helperMissing.call(depth0, "t", "coding_rules.deactivate", options)))
    + "\n            </button>\n          ";
  return buffer;
  }

function program23(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(24, program24, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program24(depth0,data) {
  
  var stack1;
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isTemplate), {hash:{},inverse:self.noop,fn:self.program(25, program25, data),data:data});
  if(stack1 || stack1 === 0) { return stack1; }
  else { return ''; }
  }
function program25(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <td class=\"coding-rules-detail-quality-profile-actions\">\n        <div class=\"button-group\">\n          <button class=\"coding-rules-detail-quality-profile-activate\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate", options) : helperMissing.call(depth0, "t", "coding_rules.activate", options)))
    + "</button>\n        </div>\n      </td>\n      ";
  return buffer;
  }

  buffer += "<table class=\"width100\">\n  <tbody>\n  <tr>\n    <td class=\"coding-rules-detail-quality-profile-name\">\n      ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.parent), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </td>\n\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.severity), {hash:{},inverse:self.program(23, program23, data),fn:self.program(6, program6, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </tr>\n  </tbody>\n</table>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-detail"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); partials = this.merge(partials, Handlebars.partials); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <li class=\"coding-rules-detail-property\">"
    + escapeExpression((helper = helpers.severityIcon || (depth0 && depth0.severityIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.severity), options) : helperMissing.call(depth0, "severityIcon", (depth0 && depth0.severity), options)))
    + " "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", (depth0 && depth0.severity), options) : helperMissing.call(depth0, "t", "severity", (depth0 && depth0.severity), options)))
    + "</li>\n  ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <li class=\"coding-rules-detail-property\">\n      <span class=\"coding-rules-detail-status coding-rules-detail-not-ready\">";
  if (helper = helpers.status) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.status); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n    </li>\n  ";
  return buffer;
  }

function program5(depth0,data) {
  
  
  return "coding-rules-detail-tags-change";
  }

function program7(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.join || (depth0 && depth0.join),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.allTags), ", ", options) : helperMissing.call(depth0, "join", (depth0 && depth0.allTags), ", ", options)));
  }

function program9(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.no_tags", options) : helperMissing.call(depth0, "t", "coding_rules.no_tags", options)));
  }

function program11(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "<li class=\"coding-rules-detail-property coding-rules-detail-tag-edit\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.sysTags), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    <input class=\"coding-rules-detail-tag-input\" type=\"text\" value=\"";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.tags), {hash:{},inverse:self.noop,fn:self.program(14, program14, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n\n    <div class=\"button-group\">\n      <button class=\"coding-rules-detail-tag-edit-done\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "Done", options) : helperMissing.call(depth0, "t", "Done", options)))
    + "</button>\n    </div>\n    <a class=\"coding-rules-details-tag-edit-cancel\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n  </li>";
  return buffer;
  }
function program12(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<i class=\"icon-tags\"></i>\n    <span>"
    + escapeExpression((helper = helpers.join || (depth0 && depth0.join),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.sysTags), ", ", options) : helperMissing.call(depth0, "join", (depth0 && depth0.sysTags), ", ", options)))
    + "</span>";
  return buffer;
  }

function program14(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.join || (depth0 && depth0.join),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.tags), ",", options) : helperMissing.call(depth0, "join", (depth0 && depth0.tags), ",", options)));
  }

function program16(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <li class=\"coding-rules-detail-property coding-rules-subcharacteristic\">";
  if (helper = helpers.subcharacteristic) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.subcharacteristic); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>\n  ";
  return buffer;
  }

function program18(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += " (";
  if (helper = helpers.language) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.language); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + ")";
  return buffer;
  }

function program20(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <li class=\"coding-rules-detail-property\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.rule_template.title", options) : helperMissing.call(depth0, "t", "coding_rules.rule_template.title", options)))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.rule_template", options) : helperMissing.call(depth0, "t", "coding_rules.rule_template", options)))
    + "</li>\n  ";
  return buffer;
  }

function program22(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <li class=\"coding-rules-detail-property\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.custom_rule.title", options) : helperMissing.call(depth0, "t", "coding_rules.custom_rule.title", options)))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.custom_rule", options) : helperMissing.call(depth0, "t", "coding_rules.custom_rule", options)))
    + "\n      (<a href=\"#rule_key=";
  if (helper = helpers.templateKey) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.templateKey); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.show_template", options) : helperMissing.call(depth0, "t", "coding_rules.show_template", options)))
    + "</a>)\n    </li>\n  ";
  return buffer;
  }

function program24(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isManual), {hash:{},inverse:self.noop,fn:self.program(25, program25, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  }
function program25(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  <div class=\"coding-rules-detail-description coding-rules-detail-description-extra\">\n    <div id=\"coding-rules-detail-description-extra\">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.htmlNote), {hash:{},inverse:self.noop,fn:self.program(26, program26, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </div>\n\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(30, program30, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n  ";
  return buffer;
  }
function program26(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n        <div class=\"rule-desc marginbottom10 markdown\">";
  if (helper = helpers.htmlNote) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.htmlNote); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</div>";
  return buffer;
  }

function program28(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<div class=\"button-group\">\n        <button id=\"coding-rules-detail-extend-description\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.extend_description", options) : helperMissing.call(depth0, "t", "coding_rules.extend_description", options)))
    + "</button>\n      </div>";
  return buffer;
  }

function program30(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "<div class=\"coding-rules-detail-extend-description-form\">\n      <table class=\"width100\">\n        <tbody>\n        <tr>\n          <td class=\"width100\" colspan=\"2\">\n            <textarea id=\"coding-rules-detail-extend-description-text\" rows=\"4\"\n                      style=\"width: 100%; margin-bottom: 4px;\">";
  if (helper = helpers.mdNote) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.mdNote); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</textarea>\n          </td>\n        </tr>\n        <tr>\n          <td>\n            <div class=\"button-group\">\n              <button id=\"coding-rules-detail-extend-description-submit\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)))
    + "</button>\n              ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.mdNote), {hash:{},inverse:self.noop,fn:self.program(31, program31, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            </div>\n            <a id=\"coding-rules-detail-extend-description-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n          </td>\n          <td class=\"right\">\n            ";
  stack1 = self.invokePartial(partials['_markdown-tips'], '_markdown-tips', depth0, helpers, partials, data);
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </td>\n        </tr>\n        </tbody>\n      </table>\n    </div>\n\n    <div id=\"coding-rules-detail-extend-description-spinner\">\n      <i class=\"spinner\"></i>\n    </div>";
  return buffer;
  }
function program31(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n              <button id=\"coding-rules-detail-extend-description-remove\" class=\"button-red\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "remove", options) : helperMissing.call(depth0, "t", "remove", options)))
    + "</button>\n              ";
  return buffer;
  }

function program33(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <h3 class=\"coding-rules-detail-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.parameters", options) : helperMissing.call(depth0, "t", "coding_rules.parameters", options)))
    + "</h3>\n  <div class=\"coding-rules-detail-parameters\">\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.params), {hash:{},inverse:self.noop,fn:self.programWithDepth(34, program34, data, depth1),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n";
  return buffer;
  }
function program34(depth0,data,depth2) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <dl class=\"coding-rules-detail-parameter\">\n      <dt class=\"coding-rules-detail-parameter-name\">";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</dt>\n      <dd class=\"coding-rules-detail-parameter-description\" data-key=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n        <p>";
  if (helper = helpers.htmlDesc) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.htmlDesc); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</p>\n        ";
  stack1 = helpers['if'].call(depth0, (depth2 && depth2.templateKey), {hash:{},inverse:self.program(40, program40, data),fn:self.program(35, program35, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </dd>\n    </dl>\n    ";
  return buffer;
  }
function program35(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n        <div class=\"subtitle\">\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.defaultValue), {hash:{},inverse:self.program(38, program38, data),fn:self.program(36, program36, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </div>\n        ";
  return buffer;
  }
function program36(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            <span class=\"value\">";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          ";
  return buffer;
  }

function program38(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.parameter.empty", options) : helperMissing.call(depth0, "t", "coding_rules.parameter.empty", options)))
    + "\n          ";
  return buffer;
  }

function program40(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.defaultValue), {hash:{},inverse:self.noop,fn:self.program(41, program41, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        ";
  return buffer;
  }
function program41(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <div class=\"subtitle\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.parameters.default_value", options) : helperMissing.call(depth0, "t", "coding_rules.parameters.default_value", options)))
    + " <span class=\"value\">";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span></div>\n          ";
  return buffer;
  }

function program43(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <div class=\"coding-rules-detail-description\">\n    <div class=\"button-group\">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.isManual), {hash:{},inverse:self.program(46, program46, data),fn:self.program(44, program44, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      <button id=\"coding-rules-detail-rule-delete\" class=\"button-red\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "delete", options) : helperMissing.call(depth0, "t", "delete", options)))
    + "</button>\n    </div>\n  </div>\n";
  return buffer;
  }
function program44(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        <button id=\"coding-rules-detail-manual-rule-change\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "edit", options) : helperMissing.call(depth0, "t", "edit", options)))
    + "</button>\n      ";
  return buffer;
  }

function program46(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        <button id=\"coding-rules-detail-custom-rule-change\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "edit", options) : helperMissing.call(depth0, "t", "edit", options)))
    + "</button>\n      ";
  return buffer;
  }

function program48(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n<div class=\"coding-rules-detail-custom-rules-section\">\n  <h3 class=\"coding-rules-detail-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.custom_rules", options) : helperMissing.call(depth0, "t", "coding_rules.custom_rules", options)))
    + "</h3>\n\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(49, program49, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  <div id=\"coding-rules-detail-custom-rules\"></div>\n</div>\n";
  return buffer;
  }
function program49(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<div class=\"button-group coding-rules-detail-quality-profiles-activation\">\n    <button id=\"coding-rules-custom-rules-create\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.create", options) : helperMissing.call(depth0, "t", "coding_rules.create", options)))
    + "</button>\n  </div>";
  return buffer;
  }

function program51(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n<div class=\"coding-rules-detail-quality-profiles-section\">\n  <h3 class=\"coding-rules-detail-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.quality_profiles", options) : helperMissing.call(depth0, "t", "coding_rules.quality_profiles", options)))
    + "</h3>\n\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(52, program52, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.isTemplate), {hash:{},inverse:self.noop,fn:self.program(55, program55, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  <div id=\"coding-rules-detail-quality-profiles\"></div>\n</div>\n";
  return buffer;
  }
function program52(depth0,data) {
  
  var stack1;
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isTemplate), {hash:{},inverse:self.noop,fn:self.program(53, program53, data),data:data});
  if(stack1 || stack1 === 0) { return stack1; }
  else { return ''; }
  }
function program53(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<div class=\"button-group coding-rules-detail-quality-profiles-activation\">\n    <button id=\"coding-rules-quality-profile-activate\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate", options) : helperMissing.call(depth0, "t", "coding_rules.activate", options)))
    + "</button>\n  </div>";
  return buffer;
  }

function program55(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n  <div class=\"coding-rules-detail-quality-profiles-template-caption warning\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.quality_profiles.template_caption", options) : helperMissing.call(depth0, "t", "coding_rules.quality_profiles.template_caption", options)))
    + "</div>\n  ";
  return buffer;
  }

  buffer += "<div class=\"coding-rules-detail-context\"></div>\n\n<h3 class=\"coding-rules-detail-header\">\n  ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n  <a class=\"coding-rules-detail-permalink\" href=\"#rule_key=";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n    <i class=\"icon-link\"></i> "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.permalink", options) : helperMissing.call(depth0, "t", "coding_rules.permalink", options)))
    + "\n  </a>\n</h3>\n<span class=\"subtitle\">";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n\n<ul class=\"coding-rules-detail-properties\">\n  ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isManual), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.status), "READY", options) : helperMissing.call(depth0, "notEq", (depth0 && depth0.status), "READY", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n  <li class=\"coding-rules-detail-property coding-rules-detail-tag-list ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n    <i class=\"icon-tags\"></i>\n    <span>";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.allTags), {hash:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</span>\n  </li>\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.subcharacteristic), {hash:{},inverse:self.noop,fn:self.program(16, program16, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  <li class=\"coding-rules-detail-property\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.available_since", options) : helperMissing.call(depth0, "t", "coding_rules.available_since", options)))
    + " "
    + escapeExpression((helper = helpers.d || (depth0 && depth0.d),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.createdAt), options) : helperMissing.call(depth0, "d", (depth0 && depth0.createdAt), options)))
    + "</li>\n  <li class=\"coding-rules-detail-property\">";
  if (helper = helpers.repository) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.repository); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1);
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isManual), {hash:{},inverse:self.noop,fn:self.program(18, program18, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</li>\n\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.isTemplate), {hash:{},inverse:self.noop,fn:self.program(20, program20, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.templateKey), {hash:{},inverse:self.noop,fn:self.program(22, program22, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</ul>\n\n<div class=\"coding-rules-detail-description rule-desc markdown\">";
  if (helper = helpers.htmlDesc) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.htmlDesc); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</div>\n\n";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.isEditable), {hash:{},inverse:self.noop,fn:self.program(24, program24, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.params), {hash:{},inverse:self.noop,fn:self.programWithDepth(33, program33, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.isEditable), {hash:{},inverse:self.noop,fn:self.program(43, program43, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.isTemplate), {hash:{},inverse:self.noop,fn:self.program(48, program48, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.qualityProfilesVisible), {hash:{},inverse:self.noop,fn:self.program(51, program51, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-facets"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n  "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.no_results", options) : helperMissing.call(depth0, "t", "coding_rules.no_results", options)))
    + "\n  ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <div class=\"navigator-facets-list-item\" data-property=\"";
  if (helper = helpers.property) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.property); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n      <div class=\"navigator-facets-list-item-name\">\n        ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.limitReached), {hash:{},inverse:self.program(6, program6, data),fn:self.program(4, program4, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </div>\n      <div class=\"navigator-facets-list-item-options\">\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.values), {hash:{},inverse:self.noop,fn:self.program(8, program8, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </div>\n    </div>\n  ";
  return buffer;
  }
function program4(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n          "
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.facets.top", (depth0 && depth0.property_message), options) : helperMissing.call(depth0, "tp", "coding_rules.facets.top", (depth0 && depth0.property_message), options)))
    + "\n        ";
  return buffer;
  }

function program6(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n          ";
  if (helper = helpers.property_message) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.property_message); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n        ";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.count), {hash:{},inverse:self.noop,fn:self.programWithDepth(9, program9, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        ";
  return buffer;
  }
function program9(depth0,data,depth1) {
  
  var buffer = "", stack1, helper;
  buffer += "\n          <a class=\"navigator-facets-list-item-option\" data-key=\"";
  if (helper = helpers.val) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.val); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-property=\""
    + escapeExpression(((stack1 = (depth1 && depth1.property)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">\n            <span class=\"navigator-facets-list-item-option-name\">";
  if (helper = helpers.text) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.text); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <span class=\"navigator-facets-list-item-option-stat\">";
  if (helper = helpers.count) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.count); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          </a>\n          ";
  return buffer;
  }

  buffer += "<div class=\"navigator-facets-list\">\n  ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.items), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.items), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-filter-bar"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  buffer += "<div class=\"navigator-filters-list\"></div>\n<button class=\"navigator-filter-submit\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "search_verb", options) : helperMissing.call(depth0, "t", "search_verb", options)))
    + "</button>";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<button id=\"coding-rules-create-rule\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.create", options) : helperMissing.call(depth0, "t", "coding_rules.create", options)))
    + "</button>";
  return buffer;
  }

  buffer += "<h1 class=\"navigator-header-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.page", options) : helperMissing.call(depth0, "t", "coding_rules.page", options)))
    + "</h1>\n\n<div class=\"navigator-header-actions button-group\">\n  <button id=\"coding-rules-new-search\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.new_search", options) : helperMissing.call(depth0, "t", "coding_rules.new_search", options)))
    + "</button>\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.canWrite), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-layout"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"navigator-header\"></div>\n<div class=\"navigator-filters\"></div>\n<div class=\"navigator-facets\"></div>\n\n<div class=\"navigator-content\">\n  <div class=\"navigator-side\">\n    <div style=\"position:relative; overflow: visible; height: 100%;\">\n      <div class=\"navigator-actions\"></div>\n      <div class=\"navigator-results\"></div>\n      <a class=\"navigator-resizer\"><i class=\"icon-resizer\"></i></a>\n    </div>\n  </div>\n  <div class=\"navigator-main\">\n    <div class=\"navigator-details\"></div>\n  </div>\n</div>";
  });

this["SS"]["Templates"]["coding-rules-list-empty"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.no_results", options) : helperMissing.call(depth0, "t", "coding_rules.no_results", options)));
  });

this["SS"]["Templates"]["coding-rules-list-item"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    &nbsp;&nbsp;\n    <span class=\"coding-rules-list-tags\">\n      <i class=\"icon-tags\"></i>\n      <span>"
    + escapeExpression((helper = helpers.join || (depth0 && depth0.join),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.allTags), ", ", options) : helperMissing.call(depth0, "join", (depth0 && depth0.allTags), ", ", options)))
    + "</span>\n    </span>\n  ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <div class=\"line-right\">\n      <span class=\"coding-rules-detail-not-ready\">";
  if (helper = helpers.status) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.status); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n    </div>\n  ";
  return buffer;
  }

  buffer += "<div class=\"line line-small\">\n  <span class=\"coding-rules-detail-status\">"
    + escapeExpression((helper = helpers['default'] || (depth0 && depth0['default']),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.language), (depth0 && depth0.manualRuleLabel), options) : helperMissing.call(depth0, "default", (depth0 && depth0.language), (depth0 && depth0.manualRuleLabel), options)))
    + "</span>\n\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.allTags), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n  ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.status), "READY", options) : helperMissing.call(depth0, "notEq", (depth0 && depth0.status), "READY", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"line\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" name=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-manual-rule-creation"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); partials = this.merge(partials, Handlebars.partials); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.update_manual_rule", options) : helperMissing.call(depth0, "t", "coding_rules.update_manual_rule", options)))
    + "</h2>\n    ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.create_manual_rule", options) : helperMissing.call(depth0, "t", "coding_rules.create_manual_rule", options)))
    + "</h2>\n    ";
  return buffer;
  }

function program5(depth0,data) {
  
  
  return " <em class=\"mandatory\">*</em>";
  }

function program7(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            ";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n          ";
  return buffer;
  }

function program9(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            <input type=\"text\" name=\"key\" id=\"coding-rules-manual-rule-creation-key\"\n              class=\"coding-rules-name-key\" value=\"";
  if (helper = helpers.internalKey) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.internalKey); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"/>\n          ";
  return buffer;
  }

function program11(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)));
  }

function program13(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "create", options) : helperMissing.call(depth0, "t", "create", options)));
  }

  buffer += "<form>\n  <div class=\"modal-head\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n\n  <div class=\"modal-body\">\n    <div class=\"modal-error\"></div>\n    <div class=\"modal-warning\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.reactivate.help", options) : helperMissing.call(depth0, "t", "coding_rules.reactivate.help", options)))
    + "</div>\n\n    <table>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "name", options) : helperMissing.call(depth0, "t", "name", options)))
    + " <em class=\"mandatory\">*</em></h3></th>\n        <td>\n          <input type=\"text\" name=\"name\" id=\"coding-rules-manual-rule-creation-name\"\n            class=\"coding-rules-name-key\" value=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"/>\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "key", options) : helperMissing.call(depth0, "t", "key", options)));
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</h3></th>\n        <td>\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "description", options) : helperMissing.call(depth0, "t", "description", options)))
    + " <em class=\"mandatory\">*</em></h3></th>\n        <td>\n          <textarea type=\"textarea\" name=\"markdown_description\" id=\"coding-rules-manual-rule-creation-html-description\"\n            class=\"coding-rules-markdown-description\" rows=\"15\">";
  if (helper = helpers.mdDesc) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.mdDesc); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</textarea>\n          <span class=\"right\">";
  stack1 = self.invokePartial(partials['_markdown-tips'], '_markdown-tips', depth0, helpers, partials, data);
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</span>\n        </td>\n      </tr>\n    </table>\n  </div>\n\n  <div class=\"modal-foot\">\n    <button id=\"coding-rules-manual-rule-creation-create\">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(13, program13, data),fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </button>\n    <a id=\"coding-rules-manual-rule-creation-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n  </div>\n</form>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-manual-rule-reactivation"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)));
  }

function program3(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "create", options) : helperMissing.call(depth0, "t", "create", options)));
  }

  buffer += "<button id=\"coding-rules-manual-rule-creation-reactivate\">\n  "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.reactivate", options) : helperMissing.call(depth0, "t", "coding_rules.reactivate", options)))
    + "\n</button>\n<button id=\"coding-rules-manual-rule-creation-create\">\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</button>\n<a id=\"coding-rules-manual-rule-creation-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-parameter-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div>\n        "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.parameters.default_value", options) : helperMissing.call(depth0, "t", "coding_rules.parameters.default_value", options)))
    + " ";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n      </div>\n    ";
  return buffer;
  }

  buffer += "<div class=\"coding-rules-parameter-full-description bubble-popup-container\">\n  <div class=\"bubble-popup-title\">";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n\n    ";
  if (helper = helpers.htmlDesc) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.htmlDesc); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.defaultValue), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-profile-filter-detail"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "icon-checkbox-checked";
  }

function program3(depth0,data) {
  
  
  return "icon-checkbox-single";
  }

function program5(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n      <br>\n      <span>\n        <i class=\"icon-checkbox icon-checkbox-invisible\"></i>\n        <span class=\"subtitle\">";
  if (helper = helpers.language) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.language); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n      </span>\n    ";
  return buffer;
  }

  buffer += "<li>\n  <label title=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-id=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n    <span>\n      <i class=\"icon-checkbox ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.checked), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += " ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.multiple), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></i>\n      ";
  if (helper = helpers.text) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.text); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n    </span>\n\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.language), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </label>\n</li>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-quality-profile-activation"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.change_details", options) : helperMissing.call(depth0, "t", "coding_rules.change_details", options)))
    + "</h2>\n    ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <h2>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate_in_quality_profile", options) : helperMissing.call(depth0, "t", "coding_rules.activate_in_quality_profile", options)))
    + "</h2>\n    ";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n          ";
  return buffer;
  }

function program7(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n            <select id=\"coding-rules-quality-profile-activation-select\">\n              ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.qualityProfiles), {hash:{},inverse:self.noop,fn:self.program(8, program8, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            </select>\n          ";
  return buffer;
  }
function program8(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n                <option value=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</option>\n              ";
  return buffer;
  }

function program10(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n              <option value=\""
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", depth0, options) : helperMissing.call(depth0, "t", "severity", depth0, options)))
    + "</option>\n            ";
  return buffer;
  }

function program12(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <tr class=\"property\">\n        <td colspan=\"2\" class=\"note\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.custom_rule.activation_notice", options) : helperMissing.call(depth0, "t", "coding_rules.custom_rule.activation_notice", options)))
    + "</td>\n      ";
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.params), {hash:{},inverse:self.noop,fn:self.program(15, program15, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }
function program15(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <tr class=\"property\">\n          <th><h3>";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</h3></th>\n          <td>\n            ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.program(18, program18, data),fn:self.program(16, program16, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.type), "TEXT", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.type), "TEXT", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            <div class=\"note\">";
  if (helper = helpers.description) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.description); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n            ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.extra), {hash:{},inverse:self.noop,fn:self.program(24, program24, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </td>\n        </tr>\n      ";
  return buffer;
  }
function program16(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <textarea class=\"width100\" rows=\"3\" name=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" placeholder=\"";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</textarea>\n            ";
  return buffer;
  }

function program18(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n              ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.program(22, program22, data),fn:self.program(19, program19, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.type), "BOOLEAN", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.type), "BOOLEAN", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  return buffer;
  }
function program19(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n              <select name=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" value=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n                <option value=\"";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "default", options) : helperMissing.call(depth0, "t", "default", options)))
    + " ("
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.defaultValue), options) : helperMissing.call(depth0, "t", (depth0 && depth0.defaultValue), options)))
    + ")</option>\n                <option value=\"true\"";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(20, program20, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.value), "true", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.value), "true", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "true", options) : helperMissing.call(depth0, "t", "true", options)))
    + "</option>\n                <option value=\"false\"";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.noop,fn:self.program(20, program20, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.value), "false", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.value), "false", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "false", options) : helperMissing.call(depth0, "t", "false", options)))
    + "</option>\n              </select>\n              ";
  return buffer;
  }
function program20(depth0,data) {
  
  
  return " selected=\"selected\"";
  }

function program22(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <input type=\"text\" name=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" value=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" placeholder=\"";
  if (helper = helpers.defaultValue) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.defaultValue); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n              ";
  return buffer;
  }

function program24(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <div class=\"note\">";
  if (helper = helpers.extra) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.extra); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n            ";
  return buffer;
  }

function program26(depth0,data) {
  
  
  return "disabled=\"disabled\"";
  }

function program28(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)));
  }

function program30(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.activate", options) : helperMissing.call(depth0, "t", "coding_rules.activate", options)));
  }

  buffer += "<form>\n  <div class=\"modal-head\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n\n  <div class=\"modal-body modal-body-select2\">\n    <div class=\"modal-error\"></div>\n\n    <table>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "coding_rules.quality_profile", options) : helperMissing.call(depth0, "t", "coding_rules.quality_profile", options)))
    + "</h3></th>\n        <td>\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.key), {hash:{},inverse:self.program(7, program7, data),fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </td>\n      </tr>\n      <tr class=\"property\">\n        <th><h3>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity", options) : helperMissing.call(depth0, "t", "severity", options)))
    + "</h3></th>\n        <td>\n          <select id=\"coding-rules-quality-profile-activation-severity\">\n            ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.severities), {hash:{},inverse:self.noop,fn:self.program(10, program10, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </select>\n        </td>\n      </tr>\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.isCustomRule), {hash:{},inverse:self.program(14, program14, data),fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </table>\n  </div>\n\n  <div class=\"modal-foot\">\n    <button id=\"coding-rules-quality-profile-activation-activate\" ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.saveEnabled), {hash:{},inverse:self.noop,fn:self.program(26, program26, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.change), {hash:{},inverse:self.program(30, program30, data),fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </button>\n    <a id=\"coding-rules-quality-profile-activation-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n  </div>\n</form>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-query-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<input type=\"text\"\n  size=\"";
  if (helper = helpers.size) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.size); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" name=\"";
  if (helper = helpers.property) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.property); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" value=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"\n  class=\"query-filter-input\"/>\n";
  return buffer;
  });

this["SS"]["Templates"]["coding-rules-repository-detail"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "icon-checkbox-checked";
  }

function program3(depth0,data) {
  
  
  return "icon-checkbox-single";
  }

function program5(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n      <br>\n      <span>\n        <i class=\"icon-checkbox icon-checkbox-invisible\"></i>\n        <span class=\"subtitle\">";
  if (helper = helpers.language) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.language); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n      </span>\n    ";
  return buffer;
  }

  buffer += "<li>\n  <label title=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-id=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n    <span>\n      <i class=\"icon-checkbox ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.checked), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += " ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.multiple), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></i>\n      ";
  if (helper = helpers.text) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.text); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n    </span>\n\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.language), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </label>\n</li>\n";
  return buffer;
  });

return this["SS"]["Templates"];

});
(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/layout',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var AppLayout;
    return AppLayout = (function(_super) {
      __extends(AppLayout, _super);

      function AppLayout() {
        return AppLayout.__super__.constructor.apply(this, arguments);
      }

      AppLayout.prototype.className = 'navigator coding-rules-navigator';

      AppLayout.prototype.template = Templates['coding-rules-layout'];

      AppLayout.prototype.storageKey = 'codingRulesResultsWidth';

      AppLayout.prototype.regions = {
        headerRegion: '.navigator-header',
        actionsRegion: '.navigator-actions',
        resultsRegion: '.navigator-results',
        detailsRegion: '.navigator-details',
        filtersRegion: '.navigator-filters',
        facetsRegion: '.navigator-facets'
      };

      AppLayout.prototype.ui = {
        side: '.navigator-side',
        results: '.navigator-results',
        details: '.navigator-details',
        resizer: '.navigator-resizer'
      };

      AppLayout.prototype.initialize = function() {
        jQuery(window).on('resize', (function(_this) {
          return function() {
            return _this.onResize();
          };
        })(this));
        this.isResize = false;
        jQuery('body').on('mousemove', (function(_this) {
          return function(e) {
            return _this.processResize(e);
          };
        })(this));
        return jQuery('body').on('mouseup', (function(_this) {
          return function() {
            return _this.stopResize();
          };
        })(this));
      };

      AppLayout.prototype.onRender = function() {
        var resultsWidth;
        this.ui.resizer.on('mousedown', (function(_this) {
          return function(e) {
            return _this.startResize(e);
          };
        })(this));
        resultsWidth = localStorage.getItem(this.storageKey);
        if (resultsWidth) {
          this.$(this.resultsRegion.el).width(+resultsWidth);
          return this.ui.side.width(+resultsWidth + 20);
        }
      };

      AppLayout.prototype.onResize = function() {
        var detailsEl, detailsHeight, detailsWidth, footerEl, footerHeight, resultsEl, resultsHeight;
        footerEl = jQuery('#footer');
        footerHeight = footerEl.outerHeight(true);
        resultsEl = this.ui.results;
        resultsHeight = jQuery(window).height() - resultsEl.offset().top - parseInt(resultsEl.css('margin-bottom'), 10) - footerHeight;
        resultsEl.height(resultsHeight);
        detailsEl = this.ui.details;
        detailsWidth = jQuery(window).width() - detailsEl.offset().left - parseInt(detailsEl.css('margin-right'), 10);
        detailsHeight = jQuery(window).height() - detailsEl.offset().top - parseInt(detailsEl.css('margin-bottom'), 10) - footerHeight;
        return detailsEl.width(detailsWidth).height(detailsHeight);
      };

      AppLayout.prototype.showSpinner = function(region) {
        return this[region].show(new Marionette.ItemView({
          template: _.template('<i class="spinner"></i>')
        }));
      };

      AppLayout.prototype.startResize = function(e) {
        this.isResize = true;
        this.originalWidth = this.ui.results.width();
        this.x = e.clientX;
        return jQuery('html').attr('unselectable', 'on').css('user-select', 'none').on('selectstart', false);
      };

      AppLayout.prototype.processResize = function(e) {
        var delta;
        if (this.isResize) {
          delta = e.clientX - this.x;
          this.$(this.resultsRegion.el).width(this.originalWidth + delta);
          this.ui.side.width(this.originalWidth + 20 + delta);
          localStorage.setItem(this.storageKey, this.ui.results.width());
          return this.onResize();
        }
      };

      AppLayout.prototype.stopResize = function() {
        if (this.isResize) {
          jQuery('html').attr('unselectable', 'off').css('user-select', 'text').off('selectstart');
        }
        this.isResize = false;
        return true;
      };

      return AppLayout;

    })(Marionette.Layout);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/router',['backbone'], function(Backbone) {
    var AppRouter;
    return AppRouter = (function(_super) {
      __extends(AppRouter, _super);

      function AppRouter() {
        return AppRouter.__super__.constructor.apply(this, arguments);
      }

      AppRouter.prototype.routes = {
        '': 'emptyQuery',
        ':query': 'index'
      };

      AppRouter.prototype.initialize = function(options) {
        return this.app = options.app;
      };

      AppRouter.prototype.parseQuery = function(query, separator) {
        return (query || '').split(separator || '|').map(function(t) {
          var tokens;
          tokens = t.split('=');
          return {
            key: tokens[0],
            value: decodeURIComponent(tokens[1])
          };
        });
      };

      AppRouter.prototype.emptyQuery = function() {
        this.app.restoreDefaultSorting();
        return this.index('');
      };

      AppRouter.prototype.index = function(query) {
        var params;
        params = this.parseQuery(query);
        return this.loadResults(params);
      };

      AppRouter.prototype.loadResults = function(params) {
        this.app.filterBarView.restoreFromQuery(params);
        if (this.app.codingRulesFacetsView) {
          this.app.codingRulesFacetsView.restoreFromQuery(params);
        }
        this.app.restoreSorting(params);
        return this.app.fetchFirstPage();
      };

      return AppRouter;

    })(Backbone.Router);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/header-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesHeaderView;
    return CodingRulesHeaderView = (function(_super) {
      __extends(CodingRulesHeaderView, _super);

      function CodingRulesHeaderView() {
        return CodingRulesHeaderView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesHeaderView.prototype.template = Templates['coding-rules-header'];

      CodingRulesHeaderView.prototype.events = {
        'click #coding-rules-new-search': 'newSearch',
        'click #coding-rules-create-rule': 'createRule'
      };

      CodingRulesHeaderView.prototype.newSearch = function() {
        return this.options.app.router.emptyQuery();
      };

      CodingRulesHeaderView.prototype.createRule = function() {
        return this.options.app.createManualRule();
      };

      CodingRulesHeaderView.prototype.serializeData = function() {
        return _.extend(CodingRulesHeaderView.__super__.serializeData.apply(this, arguments), {
          'canWrite': this.options.app.canWrite
        });
      };

      return CodingRulesHeaderView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/actions-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesStatusView;
    return CodingRulesStatusView = (function(_super) {
      __extends(CodingRulesStatusView, _super);

      function CodingRulesStatusView() {
        return CodingRulesStatusView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesStatusView.prototype.template = Templates['coding-rules-actions'];

      CodingRulesStatusView.prototype.collectionEvents = {
        'all': 'render'
      };

      CodingRulesStatusView.prototype.ui = {
        orderChoices: '.navigator-actions-order-choices',
        bulkChange: '.navigator-actions-bulk'
      };

      CodingRulesStatusView.prototype.events = {
        'click .navigator-actions-order': 'toggleOrderChoices',
        'click .navigator-actions-order-choices li': 'sort',
        'click @ui.bulkChange': 'bulkChange'
      };

      CodingRulesStatusView.prototype.onRender = function() {
        if (!this.collection.sorting.sortText) {
          this.collection.sorting.sortText = this.$("[data-sort=" + this.collection.sorting.sort + "]:first").text();
          return this.$('.navigator-actions-ordered-by').text(this.collection.sorting.sortText);
        }
      };

      CodingRulesStatusView.prototype.toggleOrderChoices = function(e) {
        e.stopPropagation();
        this.ui.orderChoices.toggleClass('open');
        if (this.ui.orderChoices.is('.open')) {
          return jQuery('body').on('click.coding_rules_actions', (function(_this) {
            return function() {
              return _this.ui.orderChoices.removeClass('open');
            };
          })(this));
        }
      };

      CodingRulesStatusView.prototype.sort = function(e) {
        var asc, el, sort;
        e.stopPropagation();
        this.ui.orderChoices.removeClass('open');
        jQuery('body').off('click.coding_rules_actions');
        el = jQuery(e.currentTarget);
        sort = el.data('sort');
        asc = el.data('asc');
        if ((sort != null) && (asc != null)) {
          this.collection.sorting = {
            sort: sort,
            sortText: el.text(),
            asc: asc
          };
          return this.options.app.fetchFirstPage();
        }
      };

      CodingRulesStatusView.prototype.bulkChange = function(e) {
        e.stopPropagation();
        return this.options.app.codingRulesBulkChangeDropdownView.toggle();
      };

      CodingRulesStatusView.prototype.serializeData = function() {
        return _.extend(CodingRulesStatusView.__super__.serializeData.apply(this, arguments), {
          canWrite: this.options.app.canWrite,
          paging: this.collection.paging,
          sorting: this.collection.sorting
        });
      };

      return CodingRulesStatusView;

    })(Marionette.ItemView);
  });

}).call(this);

define('templates/navigator',['handlebars'], function(Handlebars) {

this["SS"] = this["SS"] || {};
this["SS"]["Templates"] = this["SS"]["Templates"] || {};

this["SS"]["Templates"]["ajax-select-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"navigator-filter-search\">\n  <input type=\"text\">\n</div>\n<ul class=\"navigator-filter-select-list choices\"></ul>\n<ul class=\"navigator-filter-select-list opposite\"></ul>\n";
  });

this["SS"]["Templates"]["base-details-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"navigator-filter-details-inner\"></div>\n";
  });

this["SS"]["Templates"]["base-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "default";
  }

function program3(depth0,data) {
  
  
  return "\n  <div class=\"navigator-filter-disable\">&times;</div>\n";
  }

  buffer += "<div class=\"navigator-filter-label\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n<div class=\"navigator-filter-value ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.defaultValue), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.optional), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["checkbox-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "\n  <div class=\"navigator-filter-disable\">&times;</div>\n";
  }

  buffer += "<div class=\"navigator-filter-label\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.optional), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["choice-filter-item"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "icon-checkbox-checked";
  }

function program3(depth0,data) {
  
  
  return "icon-checkbox-single";
  }

function program5(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "<i class=\"icon-";
  if (helper = helpers.icon) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.icon); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"></i>";
  return buffer;
  }

function program7(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n      <br>\n      <span>\n        <i class=\"icon-checkbox icon-checkbox-invisible\"></i>\n        <span class=\"subtitle\">";
  if (helper = helpers.category) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.category); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n      </span>\n    ";
  return buffer;
  }

  buffer += "<li>\n  <label title=\"";
  if (helper = helpers.text) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.text); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-id=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n    <span>\n      <i class=\"icon-checkbox ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.checked), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += " ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.multiple), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></i>\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.icon), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  if (helper = helpers.text) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.text); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n    </span>\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.category), {hash:{},inverse:self.noop,fn:self.program(7, program7, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </label>\n</li>\n";
  return buffer;
  });

this["SS"]["Templates"]["choice-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<ul class=\"navigator-filter-select-list choices\"></ul>\n<ul class=\"navigator-filter-select-list opposite\"></ul>\n";
  });

this["SS"]["Templates"]["favorite-details-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  <ul class=\"navigator-filter-select-list\">\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.choicesArray), {hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </ul>\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n      <li>\n        <label data-id=\"";
  if (helper = helpers.k) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.k); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.v) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.v); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</label>\n      </li>\n    ";
  return buffer;
  }

  stack1 = (helper = helpers.ifNotEmpty || (depth0 && depth0.ifNotEmpty),options={hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.choicesArray), options) : helperMissing.call(depth0, "ifNotEmpty", (depth0 && depth0.choicesArray), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n<ul class=\"navigator-filter-select-list\">\n  <li class=\"manage\">\n    <label id=\"manage-favorites\">"
    + escapeExpression((helper = helpers.translate || (depth0 && depth0.translate),options={hash:{},data:data},helper ? helper.call(depth0, "manage", options) : helperMissing.call(depth0, "translate", "manage", options)))
    + "</label>\n  </li>\n</ul>\n";
  return buffer;
  });

this["SS"]["Templates"]["favorite-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  buffer += "<div class=\"navigator-filter-favorite-toggle\" title=\""
    + escapeExpression((helper = helpers.translate || (depth0 && depth0.translate),options={hash:{},data:data},helper ? helper.call(depth0, "filtersList", options) : helperMissing.call(depth0, "translate", "filtersList", options)))
    + "\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["metric-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n      <optgroup label=\"";
  if (helper = helpers.domain) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.domain); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.metrics), {hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </optgroup>\n    ";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n          <option value=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.short_name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.short_name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</option>\n        ";
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      <option value=\""
    + escapeExpression(((stack1 = (data == null || data === false ? data : data.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">"
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "</option>\n    ";
  return buffer;
  }

  buffer += "<div class=\"navigator-filter-details-inner\">\n  <select name=\"metric\">\n    <option></option>\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.groupedMetrics), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </select>\n\n  <select name=\"period\">\n    <option value=\"0\">"
    + escapeExpression((helper = helpers.translate || (depth0 && depth0.translate),options={hash:{},data:data},helper ? helper.call(depth0, "value", options) : helperMissing.call(depth0, "translate", "value", options)))
    + "</option>\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.periods), {hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </select>\n\n  <select name=\"op\">\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.operations), {hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </select>\n\n  <input type=\"text\" name=\"val\">\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["more-criteria-details-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <li>\n      <label data-id=\"";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-property=\"";
  if (helper = helpers.property) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.property); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.inactive), {hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += " ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.title), {hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n        ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n      </label>\n    </li>\n  ";
  return buffer;
  }
function program2(depth0,data) {
  
  
  return "class=\"inactive\"";
  }

function program4(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "title=\"";
  if (helper = helpers.title) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.title); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"";
  return buffer;
  }

  buffer += "<ul class=\"navigator-filter-select-list\">\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.filters), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</ul>\n";
  return buffer;
  });

this["SS"]["Templates"]["more-criteria-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  buffer += escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "moreCriteria", options) : helperMissing.call(depth0, "t", "moreCriteria", options)))
    + "\n";
  return buffer;
  });

this["SS"]["Templates"]["range-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;


  buffer += "<div class=\"navigator-filter-details-inner\">\n  <input class=\"navigator-filter-range-input\" type=\"text\" name=\"";
  if (helper = helpers.propertyFrom) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.propertyFrom); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" placeholder=\"";
  if (helper = helpers.placeholder) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.placeholder); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n  <label>"
    + escapeExpression((helper = helpers.translate || (depth0 && depth0.translate),options={hash:{},data:data},helper ? helper.call(depth0, "to", options) : helperMissing.call(depth0, "translate", "to", options)))
    + "</label>\n  <input class=\"navigator-filter-range-input\" type=\"text\" name=\"";
  if (helper = helpers.propertyTo) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.propertyTo); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" placeholder=\"";
  if (helper = helpers.placeholder) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.placeholder); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["string-filter"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"navigator-filter-details-inner\">\n  <input type=\"text\" name=\"";
  if (helper = helpers.property) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.property); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" value=\"";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n</div>\n";
  return buffer;
  });

return this["SS"]["Templates"];

});
requirejs.config({
  paths: {
    'handlebars': 'third-party/handlebars'
  },

  shim: {
    'handlebars': {
      exports: 'Handlebars'
    }
  }
});

define('common/handlebars-extensions',['handlebars'], function (Handlebars) {

  /*
   * Shortcut for templates retrieving
   */
  window.getTemplate = function(templateSelector) {
    return Handlebars.compile(jQuery(templateSelector).html() || '');
  };

  var defaultActions = ['comment', 'assign', 'assign_to_me', 'plan', 'set_severity'];

  Handlebars.registerHelper('log', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1);
    console.log.apply(console, args);
  });

  Handlebars.registerHelper('capitalize', function(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  });

  Handlebars.registerHelper('severityIcon', function(severity) {
    return new Handlebars.SafeString(
        '<i class="icon-severity-' + severity.toLowerCase() + '"></i>'
    );
  });

  Handlebars.registerHelper('statusIcon', function(status) {
    return new Handlebars.SafeString(
        '<i class="icon-status-' + status.toLowerCase() + '"></i>'
    );
  });

  Handlebars.registerHelper('testStatusIcon', function(status) {
    return new Handlebars.SafeString(
            '<i class="icon-test-status-' + status.toLowerCase() + '"></i>'
    );
  });

  Handlebars.registerHelper('testStatusIconClass', function(status) {
    return new Handlebars.SafeString('' +
            'icon-test-status-' + status.toLowerCase()
    );
  });

  Handlebars.registerHelper('alertIconClass', function(alert) {
    return new Handlebars.SafeString(
        'icon-alert-' + alert.toLowerCase()
    );
  });

  Handlebars.registerHelper('qualifierIcon', function(qualifier) {
    return new Handlebars.SafeString(
        qualifier ? '<i class="icon-qualifier-' + qualifier.toLowerCase() + '"></i>': ''
    );
  });

  Handlebars.registerHelper('default', function(value, defaultValue) {
    return value != null ? value : defaultValue;
  });

  Handlebars.registerHelper('show', function() {
    var args = Array.prototype.slice.call(arguments),
        ret = null;
    args.forEach(function(arg) {
      if (_.isString(arg) && ret == null) {
        ret = arg;
      }
    });
    return ret || '';
  });

  Handlebars.registerHelper('percent', function(value, total) {
    if (total > 0) {
      return '' + ((value || 0) / total * 100) + '%';
    } else {
      return '0%';
    }
  });

  Handlebars.registerHelper('eachIndex', function (context, options) {
    var ret = '';
    context.forEach(function (d, i) {
      var c = _.extend({ index: i }, d);
      ret += options.fn(c);
    });
    return ret;
  });

  Handlebars.registerHelper('eachChanged', function (context, property, options) {
    var ret = '';
    context.forEach(function (d, i) {
      var changed = i > 0 ? d[property] !== context[i - 1][property] : true,
          c = _.extend({ changed: changed }, d);
      ret += options.fn(c);
    });
    return ret;
  });

  Handlebars.registerHelper('eq', function(v1, v2, options) {
    return v1 == v2 ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('notEq', function(v1, v2, options) {
    return v1 != v2 ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('gt', function(v1, v2, options) {
    return v1 > v2 ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('notNull', function(value, options) {
    return value != null ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('notEmpty', function(array, options) {
    var cond = _.isArray(array) && array.length > 0;
    return cond ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('all', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1),
        options = arguments[arguments.length - 1],
        all = args.reduce(function(prev, current) {
          return prev && current;
        }, true);
    return all ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('any', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1),
        options = arguments[arguments.length - 1],
        any = args.reduce(function(prev, current) {
          return prev || current;
        }, false);
    return any ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('inArray', function(array, element, options) {
    if (_.isArray(array)) {
      if (array.indexOf(element) !== -1) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    }
  });

  Handlebars.registerHelper('ifNotEmpty', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1),
        options = arguments[arguments.length - 1],
        notEmpty = args.reduce(function(prev, current) {
          return prev || (current && current.length > 0);
        }, false);
    return notEmpty ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('join', function(array, separator) {
    return array.join(separator);
  });

  Handlebars.registerHelper('eachReverse', function(array, options) {
    var ret = '';

    if (array && array.length > 0) {
      for (var i = array.length - 1; i >= 0; i--) {
        ret += options.fn(array[i]);
      }
    } else {
      ret = options.inverse(this);
    }

    return ret;
  });

  Handlebars.registerHelper('joinEach', function(array, separator, options) {
    var ret = '';

    if (array && array.length > 0) {
      for (var i = 0, n = array.length; i < n; i++) {
        ret += options.fn(array[i]);
        if (i < n - 1) {
          ret += separator;
        }
      }
    } else {
      ret = options.inverse(this);
    }

    return ret;
  });

  Handlebars.registerHelper('sum', function(a, b) {
    return a + b;
  });

  Handlebars.registerHelper('dashboardUrl', function(componentKey, componentQualifier) {
    var url = baseUrl + '/dashboard/index/' + decodeURIComponent(componentKey);
    if (componentQualifier === 'FIL' || componentQualifier === 'CLA') {
      url += '?metric=sqale_index';
    }
    return url;
  });

  Handlebars.registerHelper('translate', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1);
    return window.translate.apply(this, args);
  });

  Handlebars.registerHelper('t', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1);
    return window.t.apply(this, args);
  });

  Handlebars.registerHelper('tp', function() {
    var args = Array.prototype.slice.call(arguments, 0, -1);
    return window.tp.apply(this, args);
  });

  Handlebars.registerHelper('d', function(date) {
    return moment(date).format('LL');
  });

  Handlebars.registerHelper('dt', function(date) {
    return moment(date).format('LLL');
  });

  Handlebars.registerHelper('fromNow', function(date) {
    return moment(date).fromNow();
  });

  Handlebars.registerHelper('pluginActions', function(actions, options) {
    var pluginActions = _.difference(actions, defaultActions);
    return pluginActions.reduce(function(prev, current) {
      return prev + options.fn(current);
    }, '');
  });

  Handlebars.registerHelper('ifHasExtraActions', function(actions, options) {
    var actionsLeft = _.difference(actions, defaultActions);
    if (actionsLeft.length > 0) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  Handlebars.registerHelper('withFirst', function(list, options) {
    if (list && list.length > 0) {
      return options.fn(list[0]);
    } else {
      return '';
    }
  });

  Handlebars.registerHelper('withoutFirst', function(list, options) {
    if (list && list.length > 1) {
      return list.slice(1).reduce(function(prev, current) {
        return prev + options.fn(current);
      }, '');
    } else {
      return '';
    }
  });

  var audaciousFn;
  Handlebars.registerHelper('recursive', function(children, options) {
    var out = '';

    if (options.fn !== undefined) {
      audaciousFn = options.fn;
    }

    children.forEach(function(child){
      out = out + audaciousFn(child);
    });

    return out;
  });

  Handlebars.registerHelper('sources', function(source, scm, options) {
    if (options == null) {
      options = scm;
      scm = null;
    }

    var sources = _.map(source, function(code, line) {
      return {
        lineNumber: line,
        code: code,
        scm: (scm && scm[line]) ? { author: scm[line][0], date: scm[line][1] } : undefined
      };
    });

    return sources.reduce(function(prev, current, index) {
      return prev + options.fn(_.extend({ first: index === 0 }, current));
    }, '');
  });

  Handlebars.registerHelper('operators', function(metricType, options) {
    var ops = ['LT', 'GT', 'EQ', 'NE'];

    return ops.reduce(function(prev, current) {
      return prev + options.fn(current);
    }, '');
  });

  Handlebars.registerHelper('changelog', function(diff) {
    var message = '';
    if (diff.newValue != null) {
      message = tp('issue.changelog.changed_to', t('issue.changelog.field', diff.key), diff.newValue);
    } else {
      message = tp('issue.changelog.removed', t('issue.changelog.field', diff.key));
    }
    if (diff.oldValue != null) {
      message += ' (';
      message += tp('issue.changelog.was', diff.oldValue);
      message += ')';
    }
    return message;
  });

  Handlebars.registerHelper('componentViewerHeaderLink', function(value, label, cl, hash) {
    var name = '_cw-header-link';
    if (value != null) {
      var ps = Handlebars.partials;
      if (typeof ps[name] !== 'function') {
        ps[name] = Handlebars.compile(ps[name]);
      }
      return ps[name]({ value: value, label: label, cl: cl}, hash);
    }
  });

  Handlebars.registerHelper('componentViewerHeaderItem', function(value, label, hash) {
    var name = '_cw-header-item';
    if (value != null) {
      var ps = Handlebars.partials;
      if (typeof ps[name] !== 'function') {
        ps[name] = Handlebars.compile(ps[name]);
      }
      return ps[name]({ value: value, label: label}, hash);
    }
  });

  Handlebars.registerHelper('ifMeasureShouldBeShown', function(measure, period, options) {
    if (measure != null || period != null) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  Handlebars.registerHelper('ifSCMChanged', function(source, line, options) {
    var currentLine = _.findWhere(source, { lineNumber: line }),
        prevLine = _.findWhere(source, { lineNumber: line - 1 }),
        changed = true;
    if (currentLine && prevLine && currentLine.scm && prevLine.scm) {
      changed = (currentLine.scm.author !== prevLine.scm.author)
          || (currentLine.scm.date !== prevLine.scm.date)
          || (!prevLine.show);
    }
    return changed ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('ifTestData', function(test, options) {
    if ((test.status !== 'OK') || ((test.status === 'OK') && test.coveredLines)) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  Handlebars.registerHelper('eqComponents', function (a, b, options) {
    var notEq = a && b && ((a.project !== b.project) || (a.subProject !== b.subProject));
    return notEq ? options.inverse(this) : options.fn(this);
  });

  Handlebars.registerHelper('notEqComponents', function (a, b, options) {
    var notEq = a && b && ((a.project !== b.project) || (a.subProject !== b.subProject));
    return notEq ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('projectFullName', function (component) {
    var name = component.projectName + (component.subProjectName ? (' / ' + component.subProjectName) : '');
    return name;
  });

});

define('navigator/filters/base-filters',[
  'backbone',
  'backbone.marionette',
  'templates/navigator',
  'common/handlebars-extensions'
], function (Backbone, Marionette, Templates) {

  var Filter = Backbone.Model.extend({

    defaults: {
      enabled: true,
      optional: false,
      multiple: true,
      placeholder: ''
    }

  });



  var Filters = Backbone.Collection.extend({
    model: Filter
  });



  var DetailsFilterView = Marionette.ItemView.extend({
    template: Templates['base-details-filter'],
    className: 'navigator-filter-details',


    initialize: function() {
      this.$el.on('click', function(e) {
        e.stopPropagation();
      });
      this.$el.attr('id', 'filter-' + this.model.get('property'));
    },


    onShow: function() {},
    onHide: function() {}
  });



  var BaseFilterView = Marionette.ItemView.extend({
    template: Templates['base-filter'],
    className: 'navigator-filter',


    events: function() {
      return {
        'click': 'toggleDetails',
        'click .navigator-filter-disable': 'disable'
      };
    },


    modelEvents: {
      'change:enabled': 'focus',
      'change:value': 'renderBase',

      // for more criteria filter
      'change:filters': 'render'
    },


    initialize: function(options) {
      Marionette.ItemView.prototype.initialize.apply(this, arguments);

      var detailsView = (options && options.detailsView) || DetailsFilterView;
      this.detailsView = new detailsView({
        model: this.model,
        filterView: this
      });

      this.model.view = this;
    },


    attachDetailsView: function() {
      this.detailsView.$el.detach().appendTo($j('body'));
    },


    render: function() {
      this.renderBase();

      this.attachDetailsView();
      this.detailsView.render();

      this.$el.toggleClass(
          'navigator-filter-disabled',
          !this.model.get('enabled'));

      this.$el.toggleClass(
          'navigator-filter-optional',
          this.model.get('optional'));
    },


    renderBase: function() {
      Marionette.ItemView.prototype.render.apply(this, arguments);
      this.renderInput();

      var title = this.model.get('name') + ': ' + this.renderValue();
      this.$el.prop('title', title);
      this.$el.attr('data-property', this.model.get('property'));
    },


    renderInput: function() {},


    focus: function() {
      this.render();
    },


    toggleDetails: function(e) {
      e.stopPropagation();
      this.options.filterBarView.selected = this.options.filterBarView.getEnabledFilters().index(this.$el);
      if (this.$el.hasClass('active')) {
        key.setScope('list');
        this.hideDetails();
      } else {
        key.setScope('filters');
        this.showDetails();
      }
    },


    showDetails: function() {
      this.registerShowedDetails();

      var top = this.$el.offset().top + this.$el.outerHeight() - 1,
          left = this.$el.offset().left;

      this.detailsView.$el.css({ top: top, left: left }).addClass('active');
      this.$el.addClass('active');
      this.detailsView.onShow();
    },


    registerShowedDetails: function() {
      this.options.filterBarView.hideDetails();
      this.options.filterBarView.showedView = this;
    },


    hideDetails: function() {
      this.detailsView.$el.removeClass('active');
      this.$el.removeClass('active');
      this.detailsView.onHide();
    },


    isActive: function() {
      return this.$el.is('.active');
    },


    renderValue: function() {
      return this.model.get('value') || 'unset';
    },


    isDefaultValue: function() {
      return true;
    },


    restoreFromQuery: function(q) {
      var param = _.findWhere(q, { key: this.model.get('property') });
      if (param && param.value) {
        this.model.set('enabled', true);
        this.restore(param.value, param);
      } else {
        this.clear();
      }
    },


    restore: function(value) {
      this.model.set({ value: value }, { silent: true });
      this.renderBase();
    },


    clear: function() {
      this.model.unset('value');
    },


    disable: function(e) {
      e.stopPropagation();
      this.hideDetails();
      this.options.filterBarView.hideDetails();
      this.model.set({
        enabled: false,
        value: null
      });
    },


    formatValue: function() {
      var q = {};
      if (this.model.has('property') && this.model.has('value') && this.model.get('value')) {
        q[this.model.get('property')] = this.model.get('value');
      }
      return q;
    },


    serializeData: function() {
      return _.extend({}, this.model.toJSON(), {
        value: this.renderValue(),
        defaultValue: this.isDefaultValue()
      });
    }

  });



  /*
   * Export public classes
   */

  return {
    Filter: Filter,
    Filters: Filters,
    BaseFilterView: BaseFilterView,
    DetailsFilterView: DetailsFilterView
  };

});

define('navigator/filters/choice-filters',[
  'handlebars',
  'navigator/filters/base-filters',
  'templates/navigator',
  'common/handlebars-extensions'
], function (Handlebars, BaseFilters, Templates) {

  var DetailsChoiceFilterView = BaseFilters.DetailsFilterView.extend({
    template: Templates['choice-filter'],
    itemTemplate: Templates['choice-filter-item'],


    events: function() {
      return {
        'click label': 'onCheck'
      };
    },


    render: function() {
      BaseFilters.DetailsFilterView.prototype.render.apply(this, arguments);
      this.updateLists();
    },


    renderList: function(collection, selector) {
      var that = this,
          container = this.$(selector);

      container.empty().toggleClass('hidden', collection.length === 0);
      collection.each(function (item) {
        container.append(
          that.itemTemplate(_.extend(item.toJSON(), {
            multiple: that.model.get('multiple') && item.get('id')[0] !== '!'
          }))
        );
      });
    },


    updateLists: function() {
      var choices = new Backbone.Collection(this.options.filterView.choices.reject(function(item) {
            return item.get('id')[0] === '!';
          })),
          opposite = new Backbone.Collection(this.options.filterView.choices.filter(function(item) {
            return item.get('id')[0] === '!';
          }));

      this.renderList(choices, '.choices');
      this.renderList(opposite, '.opposite');

      var current = this.currentChoice || 0;
      this.updateCurrent(current);
    },


    onCheck: function(e) {
      var checkbox = jQuery(e.currentTarget),
          id = checkbox.data('id'),
          checked = checkbox.find('.icon-checkbox-checked').length > 0;

      if (this.model.get('multiple')) {
        if (checkbox.closest('.opposite').length > 0) {
          this.options.filterView.choices.each(function(item) {
                item.set('checked', false);
              });
        } else {
          this.options.filterView.choices.filter(function(item) {
            return item.get('id')[0] === '!';
          }).forEach(function(item) {
                item.set('checked', false);
              });
        }
      } else {
        this.options.filterView.choices.each(function(item) {
          item.set('checked', false);
        });
      }

      this.options.filterView.choices.get(id).set('checked', !checked);
      this.updateValue();
      this.updateLists();
    },


    updateValue: function() {
      this.model.set('value', this.options.filterView.getSelected().map(function(m) {
        return m.get('id');
      }));
    },


    updateCurrent: function(index) {
      this.currentChoice = index;
      this.$('label').removeClass('current')
          .eq(this.currentChoice).addClass('current');
    },


    onShow: function() {
      this.bindedOnKeyDown = _.bind(this.onKeyDown, this);
      $j('body').on('keydown', this.bindedOnKeyDown);
    },


    onHide: function() {
      $j('body').off('keydown', this.bindedOnKeyDown);
    },


    onKeyDown: function(e) {
      switch (e.keyCode) {
        case 38:
          e.preventDefault();
          this.selectPrevChoice();
          break;
        case 40:
          e.preventDefault();
          this.selectNextChoice();
          break;
        case 13:
          e.preventDefault();
          this.selectCurrent();
          break;
        default:
          // Not a functional key - then skip
          break;
      }
    },


    selectNextChoice: function() {
      if (this.$('label').length > this.currentChoice + 1) {
        this.updateCurrent(this.currentChoice + 1);
        this.scrollNext();
      }
    },


    scrollNext: function() {
      var currentLabel = this.$('label').eq(this.currentChoice);
      if (currentLabel.length > 0) {
        var list = currentLabel.closest('ul'),
            labelPos = currentLabel.offset().top - list.offset().top + list.scrollTop(),
            deltaScroll = labelPos - list.height() + currentLabel.outerHeight();

        if (deltaScroll > 0) {
          list.scrollTop(deltaScroll);
        }
      }
    },


    selectPrevChoice: function() {
      if (this.currentChoice > 0) {
        this.updateCurrent(this.currentChoice - 1);
        this.scrollPrev();
      }
    },


    scrollPrev: function() {
      var currentLabel = this.$('label').eq(this.currentChoice);
      if (currentLabel.length > 0) {
        var list = currentLabel.closest('ul'),
            labelPos = currentLabel.offset().top - list.offset().top;

        if (labelPos < 0) {
          list.scrollTop(list.scrollTop() + labelPos);
        }
      }
    },


    selectCurrent: function() {
      var cb = this.$('label').eq(this.currentChoice);
      cb.click();
    },


    serializeData: function() {
      return _.extend({}, this.model.toJSON(), {
        choices: new Backbone.Collection(this.options.filterView.choices.reject(function(item) {
          return item.get('id')[0] === '!';
        })).toJSON(),
        opposite: new Backbone.Collection(this.options.filterView.choices.filter(function(item) {
          return item.get('id')[0] === '!';
        })).toJSON()
      });
    }

  });



  var ChoiceFilterView = BaseFilters.BaseFilterView.extend({

    initialize: function(options) {
      BaseFilters.BaseFilterView.prototype.initialize.call(this, {
        detailsView: (options && options.detailsView) ? options.detailsView : DetailsChoiceFilterView
      });

      var index = 0,
          icons = this.model.get('choiceIcons');

      this.choices = new Backbone.Collection(
          _.map(this.model.get('choices'), function(value, key) {
            var model = new Backbone.Model({
              id: key,
              text: value,
              checked: false,
              index: index++
            });

            if (icons && icons[key]) {
              model.set('icon', icons[key]);
            }

            return model;
          }), { comparator: 'index' }
      );
    },


    getSelected: function() {
      return this.choices.filter(function(m) {
        return m.get('checked');
      });
    },


    renderInput: function() {
      var input = $j('<select>')
          .prop('name', this.model.get('property'))
          .prop('multiple', true)
          .css('display', 'none');
      this.choices.each(function(item) {
        var option = $j('<option>')
            .prop('value', item.get('id'))
            .prop('selected', item.get('checked'))
            .text(item.get('text'));
        option.appendTo(input);
      });
      input.appendTo(this.$el);
    },


    renderValue: function() {
      var value = this.getSelected().map(function(item) {
            return item.get('text');
          }),
          defaultValue = this.model.has('defaultValue') ?
              this.model.get('defaultValue') :
              this.model.get('multiple') ? t('all') : t('any');

      return this.isDefaultValue() ? defaultValue : value.join(', ');
    },


    isDefaultValue: function() {
      var selected = this.getSelected();
      return selected.length === 0;
    },


    disable: function() {
      this.choices.each(function(item) {
        item.set('checked', false);
      });
      BaseFilters.BaseFilterView.prototype.disable.apply(this, arguments);
    },


    restoreFromQuery: function(q) {
      var param = _.findWhere(q, { key: this.model.get('property') });

      if (this.choices) {
        this.choices.forEach(function(item) {
          if (item.get('id')[0] === '!') {
            var x = _.findWhere(q, { key: item.get('id').substr(1) });
            if (item.get('id').indexOf('=') >= 0) {
              var key = item.get('id').split('=')[0].substr(1);
              var value = item.get('id').split('=')[1];
              x = _.findWhere(q, { key: key, value: value });
            }
            if (x) {
              if (!param) {
                param = { value: item.get('id') };
              } else {
                param.value += ',' + item.get('id');
              }
            }
          }
        });
      }

      if (param && param.value) {
        this.model.set('enabled', true);
        this.restore(param.value, param);
      } else {
        this.clear();
      }
    },


    restore: function(value) {
      if (_.isString(value)) {
        value = value.split(',');
      }

      if (this.choices && value.length > 0) {
        var that = this;

        that.choices.each(function(item) {
          item.set('checked', false);
        });

        var unknownValues = [];

        _.each(value, function(v) {
          var cModel = that.choices.findWhere({ id: v });
          if (cModel) {
            cModel.set('checked', true);
          } else {
            unknownValues.push(v);
          }
        });

        value = _.difference(value, unknownValues);

        this.model.set({
          value: value,
          enabled: true
        });

        this.render();
      } else {
        this.clear();
      }
    },


    clear: function() {
      if (this.choices) {
        this.choices.each(function(item) {
          item.set('checked', false);
        });
      }
      this.model.unset('value');
      this.detailsView.render();
      if (this.detailsView.updateCurrent) {
        this.detailsView.updateCurrent(0);
      }
    },


    formatValue: function() {
      var q = {};
      if (this.model.has('property') && this.model.has('value') && this.model.get('value').length > 0) {
        var opposite = _.filter(this.model.get('value'), function(item) {
          return item[0] === '!';
        });
        if (opposite.length > 0) {
          opposite.forEach(function(item) {
            if (item.indexOf('=') >= 0) {
              var paramValue = item.split('=');
              q[paramValue[0].substr(1)] = paramValue[1];
            } else {
              q[item.substr(1)] = false;
            }
          });
        } else {
          q[this.model.get('property')] = this.model.get('value').join(',');
        }
      }
      return q;
    }

  });



  /*
   * Export public classes
   */

  return {
    DetailsChoiceFilterView: DetailsChoiceFilterView,
    ChoiceFilterView: ChoiceFilterView
  };

});

define('navigator/filters/more-criteria-filters',[
  'navigator/filters/base-filters',
  'navigator/filters/choice-filters',
  'templates/navigator',
  'common/handlebars-extensions'
], function (BaseFilters, ChoiceFilters, Templates) {

  var DetailsMoreCriteriaFilterView = ChoiceFilters.DetailsChoiceFilterView.extend({
    template: Templates['more-criteria-details-filter'],


    events: {
      'click label[data-id]:not(.inactive)': 'enableFilter'
    },


    enableById: function(id) {
      this.model.view.options.filterBarView.enableFilter(id);
      this.model.view.hideDetails();
    },


    enableByProperty: function(property) {
      var filter = _.find(this.model.get('filters'), function(filter) {
        return filter.get('property') === property;
      });
      if (filter) {
        this.enableById(filter.cid);
      }
    },


    enableFilter: function(e) {
      var id = $j(e.target).data('id');
      this.enableById(id);
      this.updateCurrent(0);
    },


    selectCurrent: function() {
      this.$('label').eq(this.currentChoice).click();
    },


    serializeData: function() {
      var filters = this.model.get('filters').map(function(filter) {
            return _.extend(filter.toJSON(), { id: filter.cid });
          }),
          getName = function(filter) {
            return filter.name;
          },
          uniqueFilters = _.unique(filters, getName),
          sortedFilters = _.sortBy(uniqueFilters, getName);
      return _.extend(this.model.toJSON(), { filters: sortedFilters });
    }

  });



  var MoreCriteriaFilterView = ChoiceFilters.ChoiceFilterView.extend({
    template: Templates['more-criteria-filter'],
    className: 'navigator-filter navigator-filter-more-criteria',


    initialize: function() {
      ChoiceFilters.ChoiceFilterView.prototype.initialize.call(this, {
        detailsView: DetailsMoreCriteriaFilterView
      });
    },


    renderValue: function() {
      return '';
    },


    renderInput: function() {},


    renderBase: function() {
      ChoiceFilters.ChoiceFilterView.prototype.renderBase.call(this);
      this.$el.prop('title', '');
    },


    isDefaultValue: function() {
      return false;
    }

  });



  /*
   * Export public classes
   */

  return {
    DetailsMoreCriteriaFilterView: DetailsMoreCriteriaFilterView,
    MoreCriteriaFilterView: MoreCriteriaFilterView
  };

});

define('navigator/filters/favorite-filters',[
  'backbone',
  'backbone.marionette',
  'navigator/filters/base-filters',
  'navigator/filters/choice-filters',
  'templates/navigator',
  'common/handlebars-extensions'
], function (Backbone, Marionette, BaseFilters, ChoiceFilters, Templates) {

  var DetailsFavoriteFilterView = BaseFilters.DetailsFilterView.extend({
    template: Templates['favorite-details-filter'],


    events: {
      'click label[data-id]': 'applyFavorite',
      'click .manage label': 'manage'
    },


    applyFavorite: function(e) {
      var id = $j(e.target).data('id');
      window.location = baseUrl + this.model.get('favoriteUrl') + '/' + id;
    },


    manage: function() {
      window.location = baseUrl + this.model.get('manageUrl');
    },


    serializeData: function() {
      var choices = this.model.get('choices'),
          choicesArray =
              _.sortBy(
                  _.map(choices, function (v, k) {
                    return { v: v, k: k };
                  }),
                  'v');

      return _.extend({}, this.model.toJSON(), {
        choicesArray: choicesArray
      });
    }

  });



  var FavoriteFilterView = ChoiceFilters.ChoiceFilterView.extend({
    template: Templates['favorite-filter'],
    className: 'navigator-filter navigator-filter-favorite',


    initialize: function() {
      ChoiceFilters.ChoiceFilterView.prototype.initialize.call(this, {
        detailsView: DetailsFavoriteFilterView
      });
    },


    renderValue: function() {
      return '';
    },


    renderInput: function() {},


    isDefaultValue: function() {
      return false;
    }

  });



  /*
   * Export public classes
   */

  return {
    DetailsFavoriteFilterView: DetailsFavoriteFilterView,
    FavoriteFilterView: FavoriteFilterView
  };

});

define(
    'navigator/filters/filter-bar',[
      'backbone.marionette',
      'navigator/filters/base-filters',
      'navigator/filters/more-criteria-filters',
      'navigator/filters/favorite-filters',
      'common/handlebars-extensions'
    ],
    function (Marionette, BaseFilters) {

      return Marionette.CompositeView.extend({
        itemViewContainer: '.navigator-filters-list',


        collectionEvents: {
          'change:enabled': 'changeEnabled'
        },


        getItemView: function (item) {
          return item.get('type') || BaseFilters.BaseFilterView;
        },


        itemViewOptions: function () {
          return {
            filterBarView: this,
            app: this.options.app
          };
        },


        initialize: function () {
          Marionette.CompositeView.prototype.initialize.apply(this, arguments);

          var that = this;
          $j('body').on('click', function () {
            that.hideDetails();
          });
          this.addMoreCriteriaFilter();

          key.filter = function(e) {
            var el = jQuery(e.target),
                box = el.closest('.navigator-filter-details-inner'),
                tabbableSet = box.find(':tabbable');

            if (el.closest('.ui-dialog').length > 0 && (el.is(':input') || el.is('a'))) {
              return false;
            }

            if (el.is(':input') || el.is('a')) {
              if (e.keyCode === 9 || e.keyCode === 27) {
                return tabbableSet.index(el) >= tabbableSet.length - 1;
              }
              return false;
            }

            return true;
          };
          key('tab', 'list', function() {
            key.setScope('filters');
            that.selectFirst();
            return false;
          });
          key('shift+tab', 'filters', function() {
            that.selectPrev();
            return false;
          });
          key('tab', 'filters', function() {
            that.selectNext();
            return false;
          });
          key('escape', 'filters', function() {
            that.hideDetails();
            this.selected = -1;
            key.setScope('list');
          });
        },


        getEnabledFilters: function() {
          return this.$(this.itemViewContainer).children()
              .not('.navigator-filter-disabled')
              .not('.navigator-filter-inactive')
              .not('.navigator-filter-favorite');
        },


        selectFirst: function() {
          this.selected = -1;
          this.selectNext();
        },


        selectPrev: function() {
          var filters = this.getEnabledFilters();
          if (this.selected > 0) {
            filters.eq(this.selected).blur();
            this.selected--;
            filters.eq(this.selected).click();
            this.$('.navigator-filter-submit').blur();
          }
        },


        selectNext: function() {
          var filters = this.getEnabledFilters();
          if (this.selected < filters.length - 1) {
            filters.eq(this.selected).blur();
            this.selected++;
            filters.eq(this.selected).click();
          } else {
            this.selected = filters.length;
            this.hideDetails();
            this.$('.navigator-filter-submit').focus();
          }
        },


        addMoreCriteriaFilter: function() {
          var disabledFilters = this.collection.where({ enabled: false });
          if (disabledFilters.length > 0) {
            this.moreCriteriaFilter = new BaseFilters.Filter({
              type: require('navigator/filters/more-criteria-filters').MoreCriteriaFilterView,
              enabled: true,
              optional: false,
              filters: disabledFilters
            });
            this.collection.add(this.moreCriteriaFilter);
          }
        },


        onAfterItemAdded: function (itemView) {
          if (itemView.model.get('type') === require('navigator/filters/favorite-filters').FavoriteFilterView) {
            jQuery('.navigator-header').addClass('navigator-header-favorite');
          }
        },


        restoreFromQuery: function (q) {
          this.collection.each(function (item) {
            item.set('enabled', !item.get('optional'));
            item.view.clear();
            item.view.restoreFromQuery(q);
          });
        },


        hideDetails: function () {
          if (_.isObject(this.showedView)) {
            this.showedView.hideDetails();
          }
        },


        enableFilter: function (id) {
          var filter = this.collection.get(id),
              filterView = filter.view;

          filterView.$el.detach().insertBefore(this.$('.navigator-filter-more-criteria'));
          filter.set('enabled', true);
          filterView.showDetails();
        },


        changeEnabled: function () {
          var disabledFilters = _.reject(this.collection.where({ enabled: false }), function (filter) {
            return filter.get('type') === require('navigator/filters/more-criteria-filters').MoreCriteriaFilterView;
          });

          if (disabledFilters.length === 0) {
            this.moreCriteriaFilter.set({ enabled: false }, { silent: true });
          } else {
            this.moreCriteriaFilter.set({ enabled: true }, { silent: true });
          }
          this.moreCriteriaFilter.set('filters', disabledFilters);
        }

      });

    });

define('navigator/filters/read-only-filters',['backbone', 'navigator/filters/base-filters'], function (Backbone, BaseFilters) {

  return BaseFilters.BaseFilterView.extend({
    className: 'navigator-filter navigator-filter-read-only',


    events: {
      'click .navigator-filter-disable': 'disable'
    },


    isDefaultValue: function() {
      return false;
    },


    renderValue: function() {
      var value = this.model.get('value'),
          format = this.model.get('format');
      return value ? (format ? format(value) : value) : '';
    }

  });

});

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filter-bar-view',['navigator/filters/filter-bar', 'navigator/filters/base-filters', 'navigator/filters/favorite-filters', 'navigator/filters/more-criteria-filters', 'navigator/filters/read-only-filters', 'templates/coding-rules'], function(FilterBarView, BaseFilters, FavoriteFiltersModule, MoreCriteriaFilters, ReadOnlyFilterView, Templates) {
    var CodingRulesFilterBarView;
    return CodingRulesFilterBarView = (function(_super) {
      __extends(CodingRulesFilterBarView, _super);

      function CodingRulesFilterBarView() {
        return CodingRulesFilterBarView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesFilterBarView.prototype.template = Templates['coding-rules-filter-bar'];

      CodingRulesFilterBarView.prototype.collectionEvents = {
        'change:enabled': 'changeEnabled'
      };

      CodingRulesFilterBarView.prototype.events = {
        'click .navigator-filter-submit': 'search'
      };

      CodingRulesFilterBarView.prototype.onRender = function() {
        return this.selectFirst();
      };

      CodingRulesFilterBarView.prototype.getQuery = function() {
        var query;
        query = {};
        this.collection.each(function(filter) {
          return _.extend(query, filter.view.formatValue());
        });
        return query;
      };

      CodingRulesFilterBarView.prototype.onAfterItemAdded = function(itemView) {
        if (itemView.model.get('type') === FavoriteFiltersModule.FavoriteFilterView) {
          return jQuery('.navigator-header').addClass('navigator-header-favorite');
        }
      };

      CodingRulesFilterBarView.prototype.addMoreCriteriaFilter = function() {
        var disabledFilters, readOnlyFilters;
        readOnlyFilters = this.collection.where({
          type: ReadOnlyFilterView
        });
        disabledFilters = _.difference(this.collection.where({
          enabled: false
        }), readOnlyFilters);
        if (disabledFilters.length > 0) {
          this.moreCriteriaFilter = new BaseFilters.Filter({
            type: MoreCriteriaFilters.MoreCriteriaFilterView,
            enabled: true,
            optional: false,
            filters: disabledFilters
          });
          return this.collection.add(this.moreCriteriaFilter);
        }
      };

      CodingRulesFilterBarView.prototype.changeEnabled = function() {
        var disabledFilters;
        if (this.moreCriteriaFilter != null) {
          disabledFilters = _.reject(this.collection.where({
            enabled: false
          }), function(filter) {
            var _ref;
            return (_ref = filter.get('type')) === MoreCriteriaFilters.MoreCriteriaFilterView || _ref === ReadOnlyFilterView;
          });
          if (disabledFilters.length === 0) {
            this.moreCriteriaFilter.set({
              enabled: false
            }, {
              silent: true
            });
          } else {
            this.moreCriteriaFilter.set({
              enabled: true
            }, {
              silent: true
            });
          }
          this.moreCriteriaFilter.set({
            filters: disabledFilters
          }, {
            silent: true
          });
          return this.moreCriteriaFilter.trigger('change:filters');
        }
      };

      CodingRulesFilterBarView.prototype.search = function() {
        this.$('.navigator-filter-submit').blur();
        this.options.app.state.set({
          query: this.options.app.getQuery(),
          search: true
        });
        return this.options.app.fetchFirstPage();
      };

      CodingRulesFilterBarView.prototype.fetchNextPage = function() {
        return this.options.app.fetchNextPage();
      };

      CodingRulesFilterBarView.prototype.restoreFromWsQuery = function(query) {
        var params;
        params = _.map(query, function(value, key) {
          return {
            'key': key,
            'value': value
          };
        });
        return this.restoreFromQuery(params);
      };

      CodingRulesFilterBarView.prototype.toggle = function(property, value) {
        var choice, filter;
        filter = this.collection.findWhere({
          property: property
        });
        if (!filter.view.isActive()) {
          this.moreCriteriaFilter.view.detailsView.enableByProperty(property);
        }
        choice = filter.view.choices.get(value);
        choice.set('checked', !choice.get('checked'));
        filter.view.detailsView.updateValue();
        return filter.view.detailsView.updateLists();
      };

      return CodingRulesFilterBarView;

    })(FilterBarView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-detail-quality-profile-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesDetailQualityProfileView;
    return CodingRulesDetailQualityProfileView = (function(_super) {
      __extends(CodingRulesDetailQualityProfileView, _super);

      function CodingRulesDetailQualityProfileView() {
        return CodingRulesDetailQualityProfileView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesDetailQualityProfileView.prototype.className = 'coding-rules-detail-quality-profile';

      CodingRulesDetailQualityProfileView.prototype.template = Templates['coding-rules-detail-quality-profile'];

      CodingRulesDetailQualityProfileView.prototype.modelEvents = {
        'change': 'render'
      };

      CodingRulesDetailQualityProfileView.prototype.ui = {
        change: '.coding-rules-detail-quality-profile-change',
        revert: '.coding-rules-detail-quality-profile-revert',
        deactivate: '.coding-rules-detail-quality-profile-deactivate'
      };

      CodingRulesDetailQualityProfileView.prototype.events = {
        'click @ui.change': 'change',
        'click @ui.revert': 'revert',
        'click @ui.deactivate': 'deactivate'
      };

      CodingRulesDetailQualityProfileView.prototype.change = function() {
        this.options.app.codingRulesQualityProfileActivationView.model = this.model;
        return this.options.app.codingRulesQualityProfileActivationView.show();
      };

      CodingRulesDetailQualityProfileView.prototype.revert = function() {
        var ruleKey;
        ruleKey = this.options.rule.get('key');
        return confirmDialog({
          title: t('coding_rules.revert_to_parent_definition'),
          html: tp('coding_rules.revert_to_parent_definition.confirm', this.getParent().name),
          yesHandler: (function(_this) {
            return function() {
              return jQuery.ajax({
                type: 'POST',
                url: "" + baseUrl + "/api/qualityprofiles/activate_rule",
                data: {
                  profile_key: _this.model.get('qProfile'),
                  rule_key: ruleKey,
                  reset: true
                }
              }).done(function() {
                return _this.options.app.showRule(ruleKey);
              });
            };
          })(this)
        });
      };

      CodingRulesDetailQualityProfileView.prototype.deactivate = function() {
        var myProfile, ruleKey;
        ruleKey = this.options.rule.get('key');
        myProfile = _.findWhere(this.options.app.qualityProfiles, {
          key: this.model.get('qProfile')
        });
        return confirmDialog({
          title: t('coding_rules.deactivate'),
          html: tp('coding_rules.deactivate.confirm', myProfile.name),
          yesHandler: (function(_this) {
            return function() {
              return jQuery.ajax({
                type: 'POST',
                url: "" + baseUrl + "/api/qualityprofiles/deactivate_rule",
                data: {
                  profile_key: _this.model.get('qProfile'),
                  rule_key: ruleKey
                }
              }).done(function() {
                return _this.options.app.showRule(ruleKey);
              });
            };
          })(this)
        });
      };

      CodingRulesDetailQualityProfileView.prototype.enableUpdate = function() {
        return this.ui.update.prop('disabled', false);
      };

      CodingRulesDetailQualityProfileView.prototype.getParent = function() {
        var myProfile, parent, parentActiveInfo, parentKey;
        if (!(this.model.get('inherit') && this.model.get('inherit') !== 'NONE')) {
          return null;
        }
        myProfile = _.findWhere(this.options.app.qualityProfiles, {
          key: this.model.get('qProfile')
        });
        parentKey = myProfile.parentKey;
        parent = _.extend({}, _.findWhere(this.options.app.qualityProfiles, {
          key: parentKey
        }));
        parentActiveInfo = this.model.collection.findWhere({
          qProfile: parentKey
        }) || new Backbone.Model();
        _.extend(parent, parentActiveInfo.toJSON());
        return parent;
      };

      CodingRulesDetailQualityProfileView.prototype.enhanceParameters = function() {
        var params, parent;
        parent = this.getParent();
        params = _.sortBy(this.model.get('params'), 'key');
        if (!parent) {
          return params;
        }
        return params.map(function(p) {
          var parentParam;
          parentParam = _.findWhere(parent.params, {
            key: p.key
          });
          if (parentParam) {
            return _.extend(p, {
              original: _.findWhere(parent.params, {
                key: p.key
              }).value
            });
          } else {
            return p;
          }
        });
      };

      CodingRulesDetailQualityProfileView.prototype.serializeData = function() {
        var hash;
        return hash = _.extend(CodingRulesDetailQualityProfileView.__super__.serializeData.apply(this, arguments), {
          parent: this.getParent(),
          parameters: this.enhanceParameters(),
          canWrite: this.options.app.canWrite,
          templateKey: this.options.rule.get('templateKey'),
          isTemplate: this.options.rule.get('isTemplate')
        });
      };

      return CodingRulesDetailQualityProfileView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-detail-quality-profiles-view',['backbone.marionette', 'coding-rules/views/coding-rules-detail-quality-profile-view'], function(Marionette, CodingRulesDetailQualityProfileView) {
    var CodingRulesDetailQualityProfilesView;
    return CodingRulesDetailQualityProfilesView = (function(_super) {
      __extends(CodingRulesDetailQualityProfilesView, _super);

      function CodingRulesDetailQualityProfilesView() {
        return CodingRulesDetailQualityProfilesView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesDetailQualityProfilesView.prototype.itemView = CodingRulesDetailQualityProfileView;

      CodingRulesDetailQualityProfilesView.prototype.itemViewOptions = function() {
        return {
          app: this.options.app,
          rule: this.options.rule,
          qualityProfiles: this.collection
        };
      };

      return CodingRulesDetailQualityProfilesView;

    })(Marionette.CollectionView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-detail-custom-rule-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesDetailCustomRuleView;
    return CodingRulesDetailCustomRuleView = (function(_super) {
      __extends(CodingRulesDetailCustomRuleView, _super);

      function CodingRulesDetailCustomRuleView() {
        return CodingRulesDetailCustomRuleView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesDetailCustomRuleView.prototype.tagName = 'tr';

      CodingRulesDetailCustomRuleView.prototype.className = 'coding-rules-detail-custom-rule';

      CodingRulesDetailCustomRuleView.prototype.template = Templates['coding-rules-detail-custom-rule'];

      CodingRulesDetailCustomRuleView.prototype.ui = {
        "delete": '.coding-rules-detail-custom-rule-delete'
      };

      CodingRulesDetailCustomRuleView.prototype.events = {
        'click @ui.delete': 'delete'
      };

      CodingRulesDetailCustomRuleView.prototype["delete"] = function() {
        return confirmDialog({
          title: t('delete'),
          html: t('are_you_sure'),
          yesHandler: (function(_this) {
            return function() {
              var origEl;
              origEl = _this.$el.html();
              _this.$el.html('<i class="spinner"></i>');
              return jQuery.ajax({
                type: 'POST',
                url: "" + baseUrl + "/api/rules/delete",
                data: {
                  key: _this.model.get('key')
                }
              }).done(function() {
                var templateKey;
                templateKey = _this.options.templateKey || _this.options.templateRule.get('key');
                return _this.options.app.showRule(templateKey);
              }).fail(function() {
                return _this.$el.html(origEl);
              });
            };
          })(this)
        });
      };

      CodingRulesDetailCustomRuleView.prototype.serializeData = function() {
        return _.extend(CodingRulesDetailCustomRuleView.__super__.serializeData.apply(this, arguments), {
          templateRule: this.options.templateRule,
          canWrite: this.options.app.canWrite
        });
      };

      return CodingRulesDetailCustomRuleView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-detail-custom-rules-view',['backbone.marionette', 'coding-rules/views/coding-rules-detail-custom-rule-view'], function(Marionette, CodingRulesDetailCustomRuleView) {
    var CodingRulesDetailCustomRulesView;
    return CodingRulesDetailCustomRulesView = (function(_super) {
      __extends(CodingRulesDetailCustomRulesView, _super);

      function CodingRulesDetailCustomRulesView() {
        return CodingRulesDetailCustomRulesView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesDetailCustomRulesView.prototype.tagName = 'table';

      CodingRulesDetailCustomRulesView.prototype.className = 'width100';

      CodingRulesDetailCustomRulesView.prototype.itemView = CodingRulesDetailCustomRuleView;

      CodingRulesDetailCustomRulesView.prototype.itemViewOptions = function() {
        return {
          app: this.options.app,
          templateRule: this.options.templateRule
        };
      };

      return CodingRulesDetailCustomRulesView;

    })(Marionette.CollectionView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('common/popup',['backbone.marionette'], function(Marionette) {
    var $, PopupView;
    $ = jQuery;
    return PopupView = (function(_super) {
      __extends(PopupView, _super);

      function PopupView() {
        return PopupView.__super__.constructor.apply(this, arguments);
      }

      PopupView.prototype.className = 'bubble-popup';

      PopupView.prototype.onRender = function() {
        this.$el.detach().appendTo($('body'));
        if (this.options.bottom) {
          this.$el.addClass('bubble-popup-bottom');
          this.$el.css({
            top: this.options.triggerEl.offset().top + this.options.triggerEl.outerHeight(),
            left: this.options.triggerEl.offset().left
          });
        } else if (this.options.bottomRight) {
          this.$el.addClass('bubble-popup-bottom-right');
          this.$el.css({
            top: this.options.triggerEl.offset().top + this.options.triggerEl.outerHeight(),
            right: $(window).width() - this.options.triggerEl.offset().left - this.options.triggerEl.outerWidth()
          });
        } else {
          this.$el.css({
            top: this.options.triggerEl.offset().top,
            left: this.options.triggerEl.offset().left + this.options.triggerEl.outerWidth()
          });
        }
        return this.attachCloseEvents();
      };

      PopupView.prototype.attachCloseEvents = function() {
        return $('body').on('click.bubble-popup', (function(_this) {
          return function() {
            $('body').off('click.bubble-popup');
            return _this.close();
          };
        })(this));
      };

      return PopupView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-parameter-popup-view',['backbone.marionette', 'templates/coding-rules', 'common/popup'], function(Marionette, Templates, Popup) {
    var $, CodingRulesParameterPopupView;
    $ = jQuery;
    return CodingRulesParameterPopupView = (function(_super) {
      __extends(CodingRulesParameterPopupView, _super);

      function CodingRulesParameterPopupView() {
        return CodingRulesParameterPopupView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesParameterPopupView.prototype.template = Templates['coding-rules-parameter-popup'];

      return CodingRulesParameterPopupView;

    })(Popup);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-debt-popup-view',['backbone.marionette', 'templates/coding-rules', 'common/popup'], function(Marionette, Templates, Popup) {
    var CodingRulesDebtPopupView;
    return CodingRulesDebtPopupView = (function(_super) {
      __extends(CodingRulesDebtPopupView, _super);

      function CodingRulesDebtPopupView() {
        return CodingRulesDebtPopupView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesDebtPopupView.prototype.template = Templates['coding-rules-debt-popup'];

      CodingRulesDebtPopupView.prototype.serializeData = function() {
        return _.extend(CodingRulesDebtPopupView.__super__.serializeData.apply(this, arguments), {
          subcharacteristic: this.options.app.getSubcharacteristicName(this.model.get('debtSubChar'))
        });
      };

      return CodingRulesDebtPopupView;

    })(Popup);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-detail-view',['backbone', 'backbone.marionette', 'coding-rules/views/coding-rules-detail-quality-profiles-view', 'coding-rules/views/coding-rules-detail-quality-profile-view', 'coding-rules/views/coding-rules-detail-custom-rules-view', 'coding-rules/views/coding-rules-detail-custom-rule-view', 'coding-rules/views/coding-rules-parameter-popup-view', 'coding-rules/views/coding-rules-debt-popup-view', 'templates/coding-rules'], function(Backbone, Marionette, CodingRulesDetailQualityProfilesView, CodingRulesDetailQualityProfileView, CodingRulesDetailCustomRulesView, CodingRulesDetailCustomRuleView, CodingRulesParameterPopupView, CodingRulesDebtPopupView, Templates) {
    var CodingRulesDetailView;
    return CodingRulesDetailView = (function(_super) {
      __extends(CodingRulesDetailView, _super);

      function CodingRulesDetailView() {
        return CodingRulesDetailView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesDetailView.prototype.template = Templates['coding-rules-detail'];

      CodingRulesDetailView.prototype.regions = {
        qualityProfilesRegion: '#coding-rules-detail-quality-profiles',
        customRulesRegion: '.coding-rules-detail-custom-rules-section',
        customRulesListRegion: '#coding-rules-detail-custom-rules',
        contextRegion: '.coding-rules-detail-context'
      };

      CodingRulesDetailView.prototype.ui = {
        tagsChange: '.coding-rules-detail-tags-change',
        tagInput: '.coding-rules-detail-tag-input',
        tagsEdit: '.coding-rules-detail-tag-edit',
        tagsEditDone: '.coding-rules-detail-tag-edit-done',
        tagsEditCancel: '.coding-rules-details-tag-edit-cancel',
        tagsList: '.coding-rules-detail-tag-list',
        subcharacteristic: '.coding-rules-subcharacteristic',
        descriptionExtra: '#coding-rules-detail-description-extra',
        extendDescriptionLink: '#coding-rules-detail-extend-description',
        extendDescriptionForm: '.coding-rules-detail-extend-description-form',
        extendDescriptionSubmit: '#coding-rules-detail-extend-description-submit',
        extendDescriptionRemove: '#coding-rules-detail-extend-description-remove',
        extendDescriptionText: '#coding-rules-detail-extend-description-text',
        extendDescriptionSpinner: '#coding-rules-detail-extend-description-spinner',
        cancelExtendDescription: '#coding-rules-detail-extend-description-cancel',
        activateQualityProfile: '#coding-rules-quality-profile-activate',
        activateContextQualityProfile: '.coding-rules-detail-quality-profile-activate',
        changeQualityProfile: '.coding-rules-detail-quality-profile-update',
        createCustomRule: '#coding-rules-custom-rules-create',
        changeCustomRule: '#coding-rules-detail-custom-rule-change',
        changeManualRule: '#coding-rules-detail-manual-rule-change',
        deleteCustomRule: '#coding-rules-detail-rule-delete'
      };

      CodingRulesDetailView.prototype.events = {
        'click @ui.tagsChange': 'changeTags',
        'click @ui.tagsEditDone': 'editDone',
        'click @ui.tagsEditCancel': 'cancelEdit',
        'click @ui.extendDescriptionLink': 'showExtendDescriptionForm',
        'click @ui.cancelExtendDescription': 'hideExtendDescriptionForm',
        'click @ui.extendDescriptionSubmit': 'submitExtendDescription',
        'click @ui.extendDescriptionRemove': 'removeExtendedDescription',
        'click @ui.activateQualityProfile': 'activateQualityProfile',
        'click @ui.activateContextQualityProfile': 'activateContextQualityProfile',
        'click @ui.changeQualityProfile': 'changeQualityProfile',
        'click @ui.createCustomRule': 'createCustomRule',
        'click @ui.changeCustomRule': 'changeCustomRule',
        'click @ui.changeManualRule': 'changeManualRule',
        'click @ui.deleteCustomRule': 'deleteRule',
        'click .coding-rules-detail-parameter-name': 'toggleParameterDescription',
        'click .coding-rules-subcharacteristic': 'showDebtPopup'
      };

      CodingRulesDetailView.prototype.initialize = function(options) {
        var origParams, qualityProfileKey, qualityProfiles;
        CodingRulesDetailView.__super__.initialize.call(this, options);
        if (this.model.get('params')) {
          origParams = this.model.get('params');
          this.model.set('params', _.sortBy(origParams, 'key'));
        }
        _.map(options.actives, (function(_this) {
          return function(active) {
            return _.extend(active, options.app.getQualityProfileByKey(active.qProfile));
          };
        })(this));
        qualityProfiles = new Backbone.Collection(options.actives, {
          comparator: 'name'
        });
        this.qualityProfilesView = new CodingRulesDetailQualityProfilesView({
          app: this.options.app,
          collection: qualityProfiles,
          rule: this.model
        });
        if (!this.model.get('isTemplate')) {
          qualityProfileKey = this.options.app.getQualityProfile();
          if (qualityProfileKey) {
            this.contextProfile = qualityProfiles.findWhere({
              qProfile: qualityProfileKey
            });
            if (!this.contextProfile) {
              this.contextProfile = new Backbone.Model({
                key: qualityProfileKey,
                name: this.options.app.qualityProfileFilter.view.renderValue()
              });
            }
            this.contextQualityProfileView = new CodingRulesDetailQualityProfileView({
              app: this.options.app,
              model: this.contextProfile,
              rule: this.model,
              qualityProfiles: qualityProfiles
            });
            return this.listenTo(this.contextProfile, 'destroy', this.hideContext);
          }
        }
      };

      CodingRulesDetailView.prototype.onRender = function() {
        var customRules, customRulesOriginal, that;
        this.$el.find('.open-modal').modal();
        if (this.model.get('isTemplate')) {
          this.$(this.contextRegion.el).hide();
          if (_.isEmpty(this.options.actives)) {
            this.$(this.qualityProfilesRegion.el).hide();
          } else {
            this.qualityProfilesRegion.show(this.qualityProfilesView);
          }
          this.$(this.customRulesRegion.el).show();
          customRulesOriginal = this.$(this.customRulesRegion.el).html();
          this.$(this.customRulesRegion.el).html('<i class="spinner"></i>');
          customRules = new Backbone.Collection();
          jQuery.ajax({
            url: "" + baseUrl + "/api/rules/search",
            data: {
              template_key: this.model.get('key'),
              f: 'name,severity,params'
            }
          }).done((function(_this) {
            return function(r) {
              customRules.add(r.rules);
              if (_this.customRulesRegion) {
                if (customRules.isEmpty() && !_this.options.app.canWrite) {
                  return _this.$(_this.customRulesRegion.el).hide();
                } else {
                  _this.customRulesView = new CodingRulesDetailCustomRulesView({
                    app: _this.options.app,
                    collection: customRules,
                    templateRule: _this.model
                  });
                  _this.$(_this.customRulesRegion.el).html(customRulesOriginal);
                  return _this.customRulesListRegion.show(_this.customRulesView);
                }
              }
            };
          })(this));
        } else {
          this.$(this.customRulesRegion.el).hide();
          this.$(this.qualityProfilesRegion.el).show();
          this.qualityProfilesRegion.show(this.qualityProfilesView);
          if (this.options.app.getQualityProfile() && (this.options.app.canWrite || this.contextProfile.has('severity'))) {
            this.$(this.contextRegion.el).show();
            this.contextRegion.show(this.contextQualityProfileView);
          } else {
            this.$(this.contextRegion.el).hide();
          }
        }
        that = this;
        jQuery.ajax({
          url: "" + baseUrl + "/api/rules/tags"
        }).done((function(_this) {
          return function(r) {
            if (_this.ui.tagInput.select2) {
              return _this.ui.tagInput.select2({
                tags: _.difference(_.difference(r.tags, that.model.get('tags')), that.model.get('sysTags')),
                width: '300px'
              });
            }
          };
        })(this));
        this.ui.tagsEdit.hide();
        this.ui.extendDescriptionForm.hide();
        return this.ui.extendDescriptionSpinner.hide();
      };

      CodingRulesDetailView.prototype.toggleParameterDescription = function(e) {
        return jQuery(e.currentTarget).next('.coding-rules-detail-parameter-description').toggle();
      };

      CodingRulesDetailView.prototype.showDebtPopup = function(e) {
        var popup;
        e.stopPropagation();
        jQuery('body').click();
        popup = new CodingRulesDebtPopupView({
          model: this.model,
          app: this.options.app,
          triggerEl: jQuery(e.currentTarget)
        });
        popup.render();
        return false;
      };

      CodingRulesDetailView.prototype.hideContext = function() {
        this.contextRegion.reset();
        return this.$(this.contextRegion.el).hide();
      };

      CodingRulesDetailView.prototype.changeTags = function() {
        if (this.ui.tagsEdit.show) {
          this.ui.tagsEdit.show();
        }
        if (this.ui.tagsList.hide) {
          this.ui.tagsList.hide();
        }
        this.tagsBuffer = this.ui.tagInput.select2('val');
        key.setScope('tags');
        return key('escape', 'tags', (function(_this) {
          return function() {
            return _this.cancelEdit();
          };
        })(this));
      };

      CodingRulesDetailView.prototype.cancelEdit = function() {
        key.unbind('escape', 'tags');
        if (this.ui.tagsList.show) {
          this.ui.tagsList.show();
        }
        if (this.ui.tagInput.select2) {
          console.log(this.tagsBuffer);
          this.ui.tagInput.select2('val', this.tagsBuffer);
          this.ui.tagInput.select2('close');
        }
        if (this.ui.tagsEdit.hide) {
          return this.ui.tagsEdit.hide();
        }
      };

      CodingRulesDetailView.prototype.editDone = function() {
        var tags;
        this.ui.tagsEdit.html('<i class="spinner"></i>');
        tags = this.ui.tagInput.val();
        return jQuery.ajax({
          type: 'POST',
          url: "" + baseUrl + "/api/rules/update",
          data: {
            key: this.model.get('key'),
            tags: tags
          }
        }).done((function(_this) {
          return function(r) {
            _this.model.set('tags', r.rule.tags);
            return _this.cancelEdit();
          };
        })(this)).always((function(_this) {
          return function() {
            return _this.render();
          };
        })(this));
      };

      CodingRulesDetailView.prototype.showExtendDescriptionForm = function() {
        this.ui.descriptionExtra.hide();
        this.ui.extendDescriptionForm.show();
        key.setScope('extraDesc');
        key('escape', 'extraDesc', (function(_this) {
          return function() {
            return _this.hideExtendDescriptionForm();
          };
        })(this));
        return this.ui.extendDescriptionText.focus();
      };

      CodingRulesDetailView.prototype.hideExtendDescriptionForm = function() {
        key.unbind('escape', 'extraDesc');
        this.ui.descriptionExtra.show();
        return this.ui.extendDescriptionForm.hide();
      };

      CodingRulesDetailView.prototype.submitExtendDescription = function() {
        this.ui.extendDescriptionForm.hide();
        this.ui.extendDescriptionSpinner.show();
        return jQuery.ajax({
          type: 'POST',
          url: "" + baseUrl + "/api/rules/update",
          dataType: 'json',
          data: {
            key: this.model.get('key'),
            markdown_note: this.ui.extendDescriptionText.val()
          }
        }).done((function(_this) {
          return function(r) {
            _this.model.set({
              htmlNote: r.rule.htmlNote,
              mdNote: r.rule.mdNote
            });
            return _this.render();
          };
        })(this));
      };

      CodingRulesDetailView.prototype.removeExtendedDescription = function() {
        return confirmDialog({
          html: t('coding_rules.remove_extended_description.confirm'),
          yesHandler: (function(_this) {
            return function() {
              _this.ui.extendDescriptionText.val('');
              return _this.submitExtendDescription();
            };
          })(this)
        });
      };

      CodingRulesDetailView.prototype.activateQualityProfile = function() {
        this.options.app.codingRulesQualityProfileActivationView.model = null;
        return this.options.app.codingRulesQualityProfileActivationView.show();
      };

      CodingRulesDetailView.prototype.activateContextQualityProfile = function() {
        this.options.app.codingRulesQualityProfileActivationView.model = this.contextProfile;
        return this.options.app.codingRulesQualityProfileActivationView.show();
      };

      CodingRulesDetailView.prototype.createCustomRule = function() {
        this.options.app.codingRulesCustomRuleCreationView.templateRule = this.model;
        this.options.app.codingRulesCustomRuleCreationView.model = new Backbone.Model();
        return this.options.app.codingRulesCustomRuleCreationView.show();
      };

      CodingRulesDetailView.prototype.changeCustomRule = function() {
        this.options.app.codingRulesCustomRuleCreationView.model = this.model;
        return this.options.app.codingRulesCustomRuleCreationView.show();
      };

      CodingRulesDetailView.prototype.changeManualRule = function() {
        this.options.app.codingRulesManualRuleCreationView.model = this.model;
        return this.options.app.codingRulesManualRuleCreationView.show();
      };

      CodingRulesDetailView.prototype.deleteRule = function() {
        var ruleType;
        ruleType = this.model.has('templateKey') ? 'custom' : 'manual';
        return confirmDialog({
          title: t('delete'),
          html: tp("coding_rules.delete." + ruleType + ".confirm", this.model.get('name')),
          yesHandler: (function(_this) {
            return function() {
              return jQuery.ajax({
                type: 'POST',
                url: "" + baseUrl + "/api/rules/delete",
                data: {
                  key: _this.model.get('key')
                }
              }).done(function() {
                return _this.options.app.fetchFirstPage();
              }).fail(function() {
                return _this.options.app.showRule(_this.model.get('key'));
              });
            };
          })(this)
        });
      };

      CodingRulesDetailView.prototype.serializeData = function() {
        var contextQualityProfile, isCustom, isManual, qualityProfilesVisible, repoKey;
        contextQualityProfile = this.options.app.getQualityProfile();
        repoKey = this.model.get('repo');
        isManual = this.options.app.manualRepository().key === repoKey;
        isCustom = this.model.has('templateKey');
        qualityProfilesVisible = !isManual;
        if (qualityProfilesVisible) {
          if (this.model.get('isTemplate')) {
            qualityProfilesVisible = !_.isEmpty(this.options.actives);
          } else {
            qualityProfilesVisible = this.options.app.canWrite || !_.isEmpty(this.options.actives);
          }
        }
        return _.extend(CodingRulesDetailView.__super__.serializeData.apply(this, arguments), {
          contextQualityProfile: contextQualityProfile,
          contextQualityProfileName: this.options.app.qualityProfileFilter.view.renderValue(),
          qualityProfile: this.contextProfile,
          language: this.options.app.languages[this.model.get('lang')],
          repository: _.find(this.options.app.repositories, function(repo) {
            return repo.key === repoKey;
          }).name,
          isManual: isManual,
          canWrite: this.options.app.canWrite,
          isEditable: this.options.app.canWrite && (isManual || isCustom),
          qualityProfilesVisible: qualityProfilesVisible,
          subcharacteristic: this.options.app.getSubcharacteristicName(this.model.get('debtSubChar')),
          createdAt: moment(this.model.get('createdAt')).toDate(),
          allTags: _.union(this.model.get('sysTags'), this.model.get('tags'))
        });
      };

      return CodingRulesDetailView;

    })(Marionette.Layout);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-list-item-view',['backbone.marionette', 'coding-rules/views/coding-rules-detail-view', 'templates/coding-rules'], function(Marionette, CodingRulesDetailView, Templates) {
    var CodingRulesListItemView;
    return CodingRulesListItemView = (function(_super) {
      __extends(CodingRulesListItemView, _super);

      function CodingRulesListItemView() {
        return CodingRulesListItemView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesListItemView.prototype.tagName = 'li';

      CodingRulesListItemView.prototype.template = Templates['coding-rules-list-item'];

      CodingRulesListItemView.prototype.activeClass = 'active';

      CodingRulesListItemView.prototype.events = function() {
        return {
          'click': 'showDetail'
        };
      };

      CodingRulesListItemView.prototype.showDetail = function() {
        this.options.listView.selectIssue(this.$el);
        return this.options.app.showRule(this.model.get('key'));
      };

      CodingRulesListItemView.prototype.serializeData = function() {
        var tags;
        tags = _.union(this.model.get('sysTags'), this.model.get('tags'));
        return _.extend(CodingRulesListItemView.__super__.serializeData.apply(this, arguments), {
          manualRuleLabel: t('coding_rules.manual_rule'),
          allTags: tags,
          showDetails: (this.model.get('status') !== 'READY') || (_.isArray(tags) && tags.length > 0)
        });
      };

      return CodingRulesListItemView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-list-empty-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesListEmptyView;
    return CodingRulesListEmptyView = (function(_super) {
      __extends(CodingRulesListEmptyView, _super);

      function CodingRulesListEmptyView() {
        return CodingRulesListEmptyView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesListEmptyView.prototype.tagName = 'li';

      CodingRulesListEmptyView.prototype.className = 'navigator-results-no-results';

      CodingRulesListEmptyView.prototype.template = Templates['coding-rules-list-empty'];

      return CodingRulesListEmptyView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-list-view',['backbone.marionette', 'coding-rules/views/coding-rules-list-item-view', 'coding-rules/views/coding-rules-list-empty-view'], function(Marionette, CodingRulesListItemView, CodingRulesListEmptyView) {
    var CodingRulesListView;
    return CodingRulesListView = (function(_super) {
      __extends(CodingRulesListView, _super);

      function CodingRulesListView() {
        return CodingRulesListView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesListView.prototype.tagName = 'ol';

      CodingRulesListView.prototype.className = 'navigator-results-list';

      CodingRulesListView.prototype.itemView = CodingRulesListItemView;

      CodingRulesListView.prototype.emptyView = CodingRulesListEmptyView;

      CodingRulesListView.prototype.itemViewOptions = function() {
        return {
          listView: this,
          app: this.options.app
        };
      };

      CodingRulesListView.prototype.initialize = function() {
        var openRule;
        openRule = function(el) {
          return el.click();
        };
        this.openRule = _.debounce(openRule, 300);
        return key.setScope('list');
      };

      CodingRulesListView.prototype.onRender = function() {
        var $scrollEl, onScroll, scrollEl, throttledScroll;
        key('up', 'list', (function(_this) {
          return function(e) {
            return _this.selectPrev();
          };
        })(this));
        key('down', 'list', (function(_this) {
          return function(e) {
            return _this.selectNext();
          };
        })(this));
        $scrollEl = jQuery('.navigator-results');
        scrollEl = $scrollEl.get(0);
        onScroll = (function(_this) {
          return function() {
            if (scrollEl.offsetHeight + scrollEl.scrollTop >= scrollEl.scrollHeight) {
              return _this.options.app.fetchNextPage();
            }
          };
        })(this);
        throttledScroll = _.throttle(onScroll, 300);
        return $scrollEl.off('scroll').on('scroll', throttledScroll);
      };

      CodingRulesListView.prototype.onClose = function() {
        return this.unbindEvents();
      };

      CodingRulesListView.prototype.unbindEvents = function() {
        key.unbind('up', 'list');
        return key.unbind('down', 'list');
      };

      CodingRulesListView.prototype.selectIssue = function(el, open) {
        var rule, ruleKey;
        this.$('.active').removeClass('active');
        el.addClass('active');
        ruleKey = el.find('[name]').attr('name');
        rule = this.collection.findWhere({
          key: ruleKey
        });
        this.selected = this.collection.indexOf(rule);
        if (open) {
          return this.openRule(el);
        }
      };

      CodingRulesListView.prototype.selectFirst = function() {
        this.selected = -1;
        return this.selectNext();
      };

      CodingRulesListView.prototype.selectCurrent = function() {
        this.selected--;
        return this.selectNext();
      };

      CodingRulesListView.prototype.selectNext = function() {
        var bottom, child, container, containerHeight;
        if (this.selected + 1 < this.collection.length) {
          this.selected += 1;
          child = this.$el.children().eq(this.selected);
          container = jQuery('.navigator-results');
          containerHeight = container.height();
          bottom = child.position().top + child.outerHeight();
          if (bottom > containerHeight) {
            container.scrollTop(container.scrollTop() - containerHeight + bottom);
          }
          return this.selectIssue(child, true);
        }
      };

      CodingRulesListView.prototype.selectPrev = function() {
        var child, container, top;
        if (this.selected > 0) {
          this.selected -= 1;
          child = this.$el.children().eq(this.selected);
          container = jQuery('.navigator-results');
          top = child.position().top;
          if (top < 0) {
            container.scrollTop(container.scrollTop() + top);
          }
          return this.selectIssue(child, true);
        }
      };

      return CodingRulesListView;

    })(Marionette.CollectionView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-bulk-change-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesBulkChangeView;
    return CodingRulesBulkChangeView = (function(_super) {
      __extends(CodingRulesBulkChangeView, _super);

      function CodingRulesBulkChangeView() {
        return CodingRulesBulkChangeView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesBulkChangeView.prototype.className = 'modal';

      CodingRulesBulkChangeView.prototype.template = Templates['coding-rules-bulk-change'];

      CodingRulesBulkChangeView.prototype.ui = {
        modalFooter: '.modal-foot',
        modalError: '.modal-error',
        modalWarning: '.modal-warning',
        modalNotice: '.modal-notice',
        modalField: '.modal-field',
        codingRulesSubmitBulkChange: '#coding-rules-submit-bulk-change',
        codingRulesCancelBulkChange: '#coding-rules-cancel-bulk-change',
        codingRulesCloseBulkChange: '#coding-rules-close-bulk-change'
      };

      CodingRulesBulkChangeView.prototype.events = {
        'submit form': 'onSubmit',
        'click @ui.codingRulesCancelBulkChange': 'hide',
        'click @ui.codingRulesCloseBulkChange': 'close',
        'change select': 'enableAction'
      };

      CodingRulesBulkChangeView.prototype.onRender = function() {
        this.$el.dialog({
          dialogClass: 'no-close',
          width: '600px',
          draggable: false,
          autoOpen: false,
          modal: true,
          minHeight: 50,
          resizable: false,
          title: null
        });
        return this.$('#coding-rules-bulk-change-profile').select2({
          width: '250px',
          minimumResultsForSearch: 1
        });
      };

      CodingRulesBulkChangeView.prototype.show = function(action, param) {
        if (param == null) {
          param = null;
        }
        this.action = action;
        this.profile = param;
        this.render();
        return this.$el.dialog('open');
      };

      CodingRulesBulkChangeView.prototype.hide = function() {
        return this.$el.dialog('close');
      };

      CodingRulesBulkChangeView.prototype.close = function() {
        this.options.app.fetchFirstPage();
        this.hide();
        return false;
      };

      CodingRulesBulkChangeView.prototype.prepareQuery = function() {
        return _.extend(this.options.app.getQuery(), {
          wsAction: this.action,
          profile_key: this.$('#coding-rules-bulk-change-profile').val() || this.profile
        });
      };

      CodingRulesBulkChangeView.prototype.bulkChange = function(query) {
        var origFooter, wsAction;
        wsAction = query.wsAction;
        query = _.omit(query, 'wsAction');
        this.ui.modalError.hide();
        this.ui.modalWarning.hide();
        this.ui.modalNotice.hide();
        origFooter = this.ui.modalFooter.html();
        this.ui.modalFooter.html('<i class="spinner"></i>');
        return jQuery.ajax({
          type: 'POST',
          url: "" + baseUrl + "/api/qualityprofiles/" + wsAction + "_rules",
          data: query
        }).done((function(_this) {
          return function(r) {
            _this.ui.modalField.hide();
            if (r.failed) {
              _this.ui.modalWarning.show();
              _this.ui.modalWarning.html(tp('coding_rules.bulk_change.warning', r.succeeded, r.failed));
            } else {
              _this.ui.modalNotice.show();
              _this.ui.modalNotice.html(tp('coding_rules.bulk_change.success', r.succeeded));
            }
            _this.ui.modalFooter.html(origFooter);
            _this.$(_this.ui.codingRulesSubmitBulkChange.selector).hide();
            _this.$(_this.ui.codingRulesCancelBulkChange.selector).hide();
            _this.$(_this.ui.codingRulesCloseBulkChange.selector).show();
            return _this.$(_this.ui.codingRulesCloseBulkChange.selector).focus();
          };
        })(this)).fail((function(_this) {
          return function() {
            return _this.ui.modalFooter.html(origFooter);
          };
        })(this));
      };

      CodingRulesBulkChangeView.prototype.onSubmit = function(e) {
        e.preventDefault();
        return this.bulkChange(this.prepareQuery());
      };

      CodingRulesBulkChangeView.prototype.getAvailableQualityProfiles = function() {
        var languages, singleLanguage;
        languages = this.options.app.languageFilter.get('value');
        singleLanguage = _.isArray(languages) && languages.length === 1;
        if (singleLanguage) {
          return this.options.app.getQualityProfilesForLanguage(languages[0]);
        } else {
          return this.options.app.qualityProfiles;
        }
      };

      CodingRulesBulkChangeView.prototype.serializeData = function() {
        return {
          action: this.action,
          paging: this.options.app.codingRules.paging,
          qualityProfiles: this.options.app.qualityProfiles,
          qualityProfile: this.profile,
          qualityProfileName: this.options.app.qualityProfileFilter.view.renderValue(),
          availableQualityProfiles: this.getAvailableQualityProfiles()
        };
      };

      return CodingRulesBulkChangeView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-quality-profile-activation-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesQualityProfileActivationView;
    return CodingRulesQualityProfileActivationView = (function(_super) {
      __extends(CodingRulesQualityProfileActivationView, _super);

      function CodingRulesQualityProfileActivationView() {
        return CodingRulesQualityProfileActivationView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesQualityProfileActivationView.prototype.className = 'modal coding-rules-modal';

      CodingRulesQualityProfileActivationView.prototype.template = Templates['coding-rules-quality-profile-activation'];

      CodingRulesQualityProfileActivationView.prototype.ui = {
        qualityProfileSelect: '#coding-rules-quality-profile-activation-select',
        qualityProfileSeverity: '#coding-rules-quality-profile-activation-severity',
        qualityProfileActivate: '#coding-rules-quality-profile-activation-activate',
        qualityProfileParameters: '[name]'
      };

      CodingRulesQualityProfileActivationView.prototype.events = {
        'click #coding-rules-quality-profile-activation-cancel': 'hide',
        'click @ui.qualityProfileActivate': 'activate'
      };

      CodingRulesQualityProfileActivationView.prototype.activate = function() {
        var origFooter, params, paramsHash, profileKey, ruleKey, severity;
        profileKey = this.ui.qualityProfileSelect.val();
        params = this.ui.qualityProfileParameters.map(function() {
          return {
            key: jQuery(this).prop('name'),
            value: jQuery(this).val() || jQuery(this).prop('placeholder') || ''
          };
        }).get();
        paramsHash = (params.map(function(param) {
          return param.key + '=' + window.csvEscape(param.value);
        })).join(';');
        if (this.model) {
          profileKey = this.model.get('qProfile');
          if (!profileKey) {
            profileKey = this.model.get('key');
          }
        }
        severity = this.ui.qualityProfileSeverity.val();
        origFooter = this.$('.modal-foot').html();
        this.$('.modal-foot').html('<i class="spinner"></i>');
        ruleKey = this.rule.get('key');
        return jQuery.ajax({
          type: 'POST',
          url: "" + baseUrl + "/api/qualityprofiles/activate_rule",
          data: {
            profile_key: profileKey,
            rule_key: ruleKey,
            severity: severity,
            params: paramsHash
          }
        }).done((function(_this) {
          return function() {
            _this.options.app.showRule(ruleKey);
            return _this.hide();
          };
        })(this)).fail((function(_this) {
          return function() {
            return _this.$('.modal-foot').html(origFooter);
          };
        })(this));
      };

      CodingRulesQualityProfileActivationView.prototype.onRender = function() {
        var format, severity;
        this.$el.dialog({
          dialogClass: 'no-close',
          width: '600px',
          draggable: false,
          autoOpen: false,
          modal: true,
          minHeight: 50,
          resizable: false,
          title: null
        });
        this.ui.qualityProfileSelect.select2({
          width: '250px',
          minimumResultsForSearch: 5
        });
        format = function(state) {
          if (!state.id) {
            return state.text;
          }
          return "<i class='icon-severity-" + (state.id.toLowerCase()) + "'></i> " + state.text;
        };
        severity = (this.model && this.model.get('severity')) || this.rule.get('severity');
        this.ui.qualityProfileSeverity.val(severity);
        return this.ui.qualityProfileSeverity.select2({
          width: '250px',
          minimumResultsForSearch: 999,
          formatResult: format,
          formatSelection: format
        });
      };

      CodingRulesQualityProfileActivationView.prototype.show = function() {
        this.render();
        return this.$el.dialog('open');
      };

      CodingRulesQualityProfileActivationView.prototype.hide = function() {
        return this.$el.dialog('close');
      };

      CodingRulesQualityProfileActivationView.prototype.getAvailableQualityProfiles = function(lang) {
        var activeQualityProfiles, inactiveProfiles;
        activeQualityProfiles = this.options.app.detailView.qualityProfilesView.collection;
        inactiveProfiles = _.reject(this.options.app.qualityProfiles, (function(_this) {
          return function(profile) {
            return activeQualityProfiles.findWhere({
              key: profile.key
            });
          };
        })(this));
        return _.filter(inactiveProfiles, (function(_this) {
          return function(profile) {
            return profile.lang === lang;
          };
        })(this));
      };

      CodingRulesQualityProfileActivationView.prototype.serializeData = function() {
        var availableProfiles, modelParams, params;
        params = this.rule.get('params');
        if (this.model) {
          modelParams = this.model.get('params');
          if (modelParams) {
            params = params.map(function(p) {
              var parentParam;
              parentParam = _.findWhere(modelParams, {
                key: p.key
              });
              if (parentParam) {
                return _.extend(p, {
                  value: _.findWhere(modelParams, {
                    key: p.key
                  }).value
                });
              } else {
                return p;
              }
            });
          }
        }
        availableProfiles = this.getAvailableQualityProfiles(this.rule.get('lang'));
        return _.extend(CodingRulesQualityProfileActivationView.__super__.serializeData.apply(this, arguments), {
          rule: this.rule.toJSON(),
          change: this.model && this.model.has('severity'),
          params: params,
          qualityProfiles: availableProfiles,
          severities: ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'],
          saveEnabled: !_.isEmpty(availableProfiles) || (this.model && this.model.get('qProfile')),
          isCustomRule: (this.model && this.model.has('templateKey')) || this.rule.has('templateKey')
        });
      };

      return CodingRulesQualityProfileActivationView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-bulk-change-dropdown-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesBulkChangeDropdownView;
    return CodingRulesBulkChangeDropdownView = (function(_super) {
      __extends(CodingRulesBulkChangeDropdownView, _super);

      function CodingRulesBulkChangeDropdownView() {
        return CodingRulesBulkChangeDropdownView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesBulkChangeDropdownView.prototype.className = 'coding-rules-bulk-change-dropdown';

      CodingRulesBulkChangeDropdownView.prototype.template = Templates['coding-rules-bulk-change-dropdown'];

      CodingRulesBulkChangeDropdownView.prototype.events = {
        'click .coding-rules-bulk-change-dropdown-link': 'doAction'
      };

      CodingRulesBulkChangeDropdownView.prototype.doAction = function(e) {
        var action, param;
        action = jQuery(e.currentTarget).data('action');
        param = jQuery(e.currentTarget).data('param');
        return this.options.app.codingRulesBulkChangeView.show(action, param);
      };

      CodingRulesBulkChangeDropdownView.prototype.onRender = function() {
        jQuery('body').append(this.el);
        jQuery('body').off('click.bulk-change').on('click.bulk-change', (function(_this) {
          return function() {
            return _this.hide();
          };
        })(this));
        return this.$el.css({
          top: jQuery('.navigator-actions').offset().top + jQuery('.navigator-actions').height() + 1,
          left: jQuery('.navigator-actions').offset().left + jQuery('.navigator-actions').outerWidth() - this.$el.outerWidth()
        });
      };

      CodingRulesBulkChangeDropdownView.prototype.toggle = function() {
        if (this.$el.is(':visible')) {
          return this.hide();
        } else {
          return this.show();
        }
      };

      CodingRulesBulkChangeDropdownView.prototype.show = function() {
        this.render();
        return this.$el.show();
      };

      CodingRulesBulkChangeDropdownView.prototype.hide = function() {
        return this.$el.hide();
      };

      CodingRulesBulkChangeDropdownView.prototype.serializeData = function() {
        var activationValues, languages, qualityProfile;
        languages = this.options.app.languageFilter.get('value');
        activationValues = this.options.app.activationFilter.get('value') || [];
        qualityProfile = this.options.app.getQualityProfile();
        return {
          qualityProfile: qualityProfile,
          qualityProfileName: this.options.app.qualityProfileFilter.view.renderValue(),
          singleLanguage: _.isArray(languages) && languages.length === 1,
          language: this.options.app.languageFilter.view.renderValue(),
          allowActivateOnProfile: qualityProfile && (activationValues.length === 0 || activationValues[0] === 'false'),
          allowDeactivateOnProfile: qualityProfile && (activationValues.length === 0 || activationValues[0] === 'true')
        };
      };

      return CodingRulesBulkChangeDropdownView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-facets-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesFacetsView;
    return CodingRulesFacetsView = (function(_super) {
      __extends(CodingRulesFacetsView, _super);

      function CodingRulesFacetsView() {
        return CodingRulesFacetsView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesFacetsView.prototype.template = Templates['coding-rules-facets'];

      CodingRulesFacetsView.prototype.ui = {
        facets: '.navigator-facets-list-item',
        options: '.navigator-facets-list-item-option'
      };

      CodingRulesFacetsView.prototype.events = {
        'click @ui.options': 'selectOption'
      };

      CodingRulesFacetsView.prototype.initialize = function() {
        var that;
        CodingRulesFacetsView.__super__.initialize.call(this);
        that = this;
        return this.options.collection.each(function(facet) {
          var property;
          property = facet.get('property');
          facet.set('property_message', t('coding_rules.facets.' + property));
          facet.set('limitReached', facet.get('values').length >= 10);
          return _.each(facet.get('values'), function(value) {
            return value.text = that.options.app.facetLabel(property, value.val);
          });
        });
      };

      CodingRulesFacetsView.prototype.selectOption = function(e) {
        var option, property, value;
        option = jQuery(e.currentTarget);
        option.toggleClass('active');
        property = option.closest('.navigator-facets-list-item').data('property');
        value = option.data('key');
        this.options.app.filterBarView.toggle(property, value);
        return this.applyOptions();
      };

      CodingRulesFacetsView.prototype.applyOptions = function() {
        return this.options.app.fetchFirstPage();
      };

      CodingRulesFacetsView.prototype.restoreFromQuery = function(params) {
        this.ui.options.each(function() {
          return jQuery(this).removeClass('active');
        });
        return this.ui.facets.each(function() {
          var property;
          property = jQuery(this).data('property');
          if (!!params[property]) {
            return _(params[property].split(',')).map(function(value) {
              return jQuery('.navigator-facets-list-item[data-property="' + property + '"] .navigator-facets-list-item-option[data-key="' + value + '"]').addClass('active');
            });
          }
        });
      };

      return CodingRulesFacetsView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-custom-rule-creation-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesCustomRuleCreationView;
    return CodingRulesCustomRuleCreationView = (function(_super) {
      __extends(CodingRulesCustomRuleCreationView, _super);

      function CodingRulesCustomRuleCreationView() {
        return CodingRulesCustomRuleCreationView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesCustomRuleCreationView.prototype.className = 'modal coding-rules-modal';

      CodingRulesCustomRuleCreationView.prototype.template = Templates['coding-rules-custom-rule-creation'];

      CodingRulesCustomRuleCreationView.prototype.ui = {
        customRuleCreationKey: '#coding-rules-custom-rule-creation-key',
        customRuleCreationName: '#coding-rules-custom-rule-creation-name',
        customRuleCreationHtmlDescription: '#coding-rules-custom-rule-creation-html-description',
        customRuleCreationSeverity: '#coding-rules-custom-rule-creation-severity',
        customRuleCreationStatus: '#coding-rules-custom-rule-creation-status',
        customRuleCreationParameters: '[name]',
        customRuleCreationCreate: '#coding-rules-custom-rule-creation-create',
        customRuleCreationReactivate: '#coding-rules-custom-rule-creation-reactivate',
        modalFoot: '.modal-foot'
      };

      CodingRulesCustomRuleCreationView.prototype.events = {
        'input @ui.customRuleCreationName': 'generateKey',
        'keydown @ui.customRuleCreationName': 'generateKey',
        'keyup @ui.customRuleCreationName': 'generateKey',
        'input @ui.customRuleCreationKey': 'flagKey',
        'keydown @ui.customRuleCreationKey': 'flagKey',
        'keyup @ui.customRuleCreationKey': 'flagKey',
        'click #coding-rules-custom-rule-creation-cancel': 'hide',
        'click @ui.customRuleCreationCreate': 'create',
        'click @ui.customRuleCreationReactivate': 'reactivate'
      };

      CodingRulesCustomRuleCreationView.prototype.generateKey = function() {
        var generatedKey;
        if (!this.keyModifiedByUser) {
          if (this.ui.customRuleCreationKey) {
            generatedKey = this.ui.customRuleCreationName.val().latinize().replace(/[^A-Za-z0-9]/g, '_');
            return this.ui.customRuleCreationKey.val(generatedKey);
          }
        }
      };

      CodingRulesCustomRuleCreationView.prototype.flagKey = function() {
        this.keyModifiedByUser = true;
        return jQuery(this.ui.customRuleCreationReactivate.selector).hide();
      };

      CodingRulesCustomRuleCreationView.prototype.create = function() {
        var action, params, postData;
        action = 'create';
        if (this.model && this.model.has('key')) {
          action = 'update';
        }
        postData = {
          name: this.ui.customRuleCreationName.val(),
          markdown_description: this.ui.customRuleCreationHtmlDescription.val(),
          severity: this.ui.customRuleCreationSeverity.val(),
          status: this.ui.customRuleCreationStatus.val()
        };
        if (this.model && this.model.has('key')) {
          postData.key = this.model.get('key');
        } else {
          postData.template_key = this.templateRule.get('key');
          postData.custom_key = this.ui.customRuleCreationKey.val();
          postData.prevent_reactivation = true;
        }
        params = this.ui.customRuleCreationParameters.map(function() {
          var node, value;
          node = jQuery(this);
          value = node.val();
          if (!value && action === 'create') {
            value = node.prop('placeholder') || '';
          }
          return {
            key: node.prop('name'),
            value: value
          };
        }).get();
        postData.params = (params.map(function(param) {
          return param.key + '=' + window.csvEscape(param.value);
        })).join(';');
        return this.sendRequest(action, postData);
      };

      CodingRulesCustomRuleCreationView.prototype.reactivate = function() {
        var params, postData;
        postData = {
          name: this.existingRule.name,
          markdown_description: this.existingRule.mdDesc,
          severity: this.existingRule.severity,
          status: this.existingRule.status,
          template_key: this.existingRule.templateKey,
          custom_key: this.ui.customRuleCreationKey.val(),
          prevent_reactivation: false
        };
        params = this.existingRule.params;
        postData.params = (params.map(function(param) {
          return param.key + '=' + param.defaultValue;
        })).join(';');
        return this.sendRequest('create', postData);
      };

      CodingRulesCustomRuleCreationView.prototype.sendRequest = function(action, postData) {
        var origFooter;
        this.$('.modal-error').hide();
        this.$('.modal-warning').hide();
        origFooter = this.ui.modalFoot.html();
        this.ui.modalFoot.html('<i class="spinner"></i>');
        return jQuery.ajax({
          type: 'POST',
          url: ("" + baseUrl + "/api/rules/") + action,
          data: postData,
          error: function() {}
        }).done((function(_this) {
          return function(r) {
            delete _this.templateRule;
            _this.options.app.showRule(r.rule.key);
            return _this.hide();
          };
        })(this)).fail((function(_this) {
          return function(jqXHR, textStatus, errorThrown) {
            if (jqXHR.status === 409) {
              _this.existingRule = jqXHR.responseJSON.rule;
              _this.$('.modal-warning').show();
              return _this.ui.modalFoot.html(Templates['coding-rules-custom-rule-reactivation'](_this));
            } else {
              jQuery.ajaxSettings.error(jqXHR, textStatus, errorThrown);
              return _this.ui.modalFoot.html(origFooter);
            }
          };
        })(this));
      };

      CodingRulesCustomRuleCreationView.prototype.onRender = function() {
        var format, severity, status;
        this.$el.dialog({
          dialogClass: 'no-close',
          width: '600px',
          draggable: false,
          autoOpen: false,
          modal: true,
          minHeight: 50,
          resizable: false,
          title: null
        });
        this.keyModifiedByUser = false;
        format = function(state) {
          if (!state.id) {
            return state.text;
          }
          return "<i class='icon-severity-" + (state.id.toLowerCase()) + "'></i> " + state.text;
        };
        severity = (this.model && this.model.get('severity')) || this.templateRule.get('severity');
        this.ui.customRuleCreationSeverity.val(severity);
        this.ui.customRuleCreationSeverity.select2({
          width: '250px',
          minimumResultsForSearch: 999,
          formatResult: format,
          formatSelection: format
        });
        status = (this.model && this.model.get('status')) || this.templateRule.get('status');
        this.ui.customRuleCreationStatus.val(status);
        return this.ui.customRuleCreationStatus.select2({
          width: '250px',
          minimumResultsForSearch: 999
        });
      };

      CodingRulesCustomRuleCreationView.prototype.show = function() {
        this.render();
        return this.$el.dialog('open');
      };

      CodingRulesCustomRuleCreationView.prototype.hide = function() {
        return this.$el.dialog('close');
      };

      CodingRulesCustomRuleCreationView.prototype.serializeData = function() {
        var params;
        params = {};
        if (this.templateRule) {
          params = this.templateRule.get('params');
        } else if (this.model && this.model.has('params')) {
          params = this.model.get('params').map(function(p) {
            return _.extend(p, {
              value: p.defaultValue
            });
          });
        }
        return _.extend(CodingRulesCustomRuleCreationView.__super__.serializeData.apply(this, arguments), {
          change: this.model && this.model.has('key'),
          params: params,
          severities: ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'],
          statuses: _.map(this.options.app.statuses, function(value, key) {
            return {
              id: key,
              text: value
            };
          })
        });
      };

      return CodingRulesCustomRuleCreationView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/coding-rules-manual-rule-creation-view',['backbone.marionette', 'templates/coding-rules'], function(Marionette, Templates) {
    var CodingRulesManualRuleCreationView;
    return CodingRulesManualRuleCreationView = (function(_super) {
      __extends(CodingRulesManualRuleCreationView, _super);

      function CodingRulesManualRuleCreationView() {
        return CodingRulesManualRuleCreationView.__super__.constructor.apply(this, arguments);
      }

      CodingRulesManualRuleCreationView.prototype.className = 'modal';

      CodingRulesManualRuleCreationView.prototype.template = Templates['coding-rules-manual-rule-creation'];

      CodingRulesManualRuleCreationView.prototype.ui = {
        manualRuleCreationKey: '#coding-rules-manual-rule-creation-key',
        manualRuleCreationName: '#coding-rules-manual-rule-creation-name',
        manualRuleCreationHtmlDescription: '#coding-rules-manual-rule-creation-html-description',
        manualRuleCreationSeverity: '#coding-rules-manual-rule-creation-severity',
        manualRuleCreationStatus: '#coding-rules-manual-rule-creation-status',
        manualRuleCreationParameters: '[name]',
        manualRuleCreationCreate: '#coding-rules-manual-rule-creation-create',
        manualRuleCreationReactivate: '#coding-rules-manual-rule-creation-reactivate',
        modalFoot: '.modal-foot'
      };

      CodingRulesManualRuleCreationView.prototype.events = {
        'input @ui.manualRuleCreationName': 'generateKey',
        'keydown @ui.manualRuleCreationName': 'generateKey',
        'keyup @ui.manualRuleCreationName': 'generateKey',
        'input @ui.manualRuleCreationKey': 'flagKey',
        'keydown @ui.manualRuleCreationKey': 'flagKey',
        'keyup @ui.manualRuleCreationKey': 'flagKey',
        'click #coding-rules-manual-rule-creation-cancel': 'hide',
        'click @ui.manualRuleCreationCreate': 'create',
        'click @ui.manualRuleCreationReactivate': 'reactivate'
      };

      CodingRulesManualRuleCreationView.prototype.generateKey = function() {
        var generatedKey;
        if (!this.keyModifiedByUser) {
          if (this.ui.manualRuleCreationKey) {
            generatedKey = this.ui.manualRuleCreationName.val().latinize().replace(/[^A-Za-z0-9]/g, '_');
            return this.ui.manualRuleCreationKey.val(generatedKey);
          }
        }
      };

      CodingRulesManualRuleCreationView.prototype.flagKey = function() {
        this.keyModifiedByUser = true;
        return jQuery(this.ui.manualRuleCreationReactivate.selector).hide();
      };

      CodingRulesManualRuleCreationView.prototype.create = function() {
        var action, postData;
        action = 'create';
        if (this.model && this.model.has('key')) {
          action = 'update';
        }
        postData = {
          name: this.ui.manualRuleCreationName.val(),
          markdown_description: this.ui.manualRuleCreationHtmlDescription.val()
        };
        if (this.model && this.model.has('key')) {
          postData.key = this.model.get('key');
        } else {
          postData.manual_key = this.ui.manualRuleCreationKey.val();
          postData.prevent_reactivation = true;
        }
        return this.sendRequest(action, postData);
      };

      CodingRulesManualRuleCreationView.prototype.reactivate = function() {
        var postData;
        postData = {
          name: this.existingRule.name,
          markdown_description: this.existingRule.mdDesc,
          manual_key: this.ui.manualRuleCreationKey.val(),
          prevent_reactivation: false
        };
        return this.sendRequest('create', postData);
      };

      CodingRulesManualRuleCreationView.prototype.sendRequest = function(action, postData) {
        var origFooter;
        this.$('.modal-error').hide();
        this.$('.modal-warning').hide();
        origFooter = this.ui.modalFoot.html();
        this.ui.modalFoot.html('<i class="spinner"></i>');
        return jQuery.ajax({
          type: 'POST',
          url: ("" + baseUrl + "/api/rules/") + action,
          data: postData,
          error: function() {}
        }).done((function(_this) {
          return function(r) {
            _this.options.app.showRule(r.rule.key);
            return _this.hide();
          };
        })(this)).fail((function(_this) {
          return function(jqXHR, textStatus, errorThrown) {
            if (jqXHR.status === 409) {
              _this.existingRule = jqXHR.responseJSON.rule;
              _this.$('.modal-warning').show();
              return _this.ui.modalFoot.html(Templates['coding-rules-manual-rule-reactivation'](_this));
            } else {
              jQuery.ajaxSettings.error(jqXHR, textStatus, errorThrown);
              return _this.ui.modalFoot.html(origFooter);
            }
          };
        })(this));
      };

      CodingRulesManualRuleCreationView.prototype.onRender = function() {
        var format;
        this.$el.dialog({
          dialogClass: 'no-close',
          width: '600px',
          draggable: false,
          autoOpen: false,
          modal: true,
          minHeight: 50,
          resizable: false,
          title: null
        });
        this.keyModifiedByUser = false;
        return format = function(state) {
          if (!state.id) {
            return state.text;
          }
          return "<i class='icon-severity-" + (state.id.toLowerCase()) + "'></i> " + state.text;
        };
      };

      CodingRulesManualRuleCreationView.prototype.show = function() {
        this.render();
        return this.$el.dialog('open');
      };

      CodingRulesManualRuleCreationView.prototype.hide = function() {
        return this.$el.dialog('close');
      };

      CodingRulesManualRuleCreationView.prototype.serializeData = function() {
        return _.extend(CodingRulesManualRuleCreationView.__super__.serializeData.apply(this, arguments), {
          change: this.model && this.model.has('key')
        });
      };

      return CodingRulesManualRuleCreationView;

    })(Marionette.ItemView);
  });

}).call(this);

define('navigator/filters/string-filters',[
  'navigator/filters/base-filters',
  'templates/navigator',
  'common/handlebars-extensions'
], function (BaseFilters, Templates) {

  var DetailsStringFilterView = BaseFilters.DetailsFilterView.extend({
    template: Templates['string-filter'],


    events: {
      'change input': 'change'
    },


    change: function(e) {
      this.model.set('value', $j(e.target).val());
    },


    onShow: function() {
      BaseFilters.DetailsFilterView.prototype.onShow.apply(this, arguments);
      this.$(':input').focus();
    },


    serializeData: function() {
      return _.extend({}, this.model.toJSON(), {
        value: this.model.get('value') || ''
      });
    }

  });



  return BaseFilters.BaseFilterView.extend({

    initialize: function() {
      BaseFilters.BaseFilterView.prototype.initialize.call(this, {
        detailsView: DetailsStringFilterView
      });
    },


    renderValue: function() {
      return this.isDefaultValue() ? '—' : this.model.get('value');
    },


    renderInput: function() {
      $j('<input>')
          .prop('name', this.model.get('property'))
          .prop('type', 'hidden')
          .css('display', 'none')
          .val(this.model.get('value') || '')
          .appendTo(this.$el);
    },


    isDefaultValue: function() {
      return !this.model.get('value');
    },


    restore: function(value) {
      this.model.set({
        value: value,
        enabled: true
      });
    },


    clear: function() {
      this.model.unset('value');
      this.detailsView.render();
    }

  });

});

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('navigator/filters/date-filter-view',['navigator/filters/string-filters'], function(StringFilterView) {
    var DateFilterView;
    return DateFilterView = (function(_super) {
      __extends(DateFilterView, _super);

      function DateFilterView() {
        return DateFilterView.__super__.constructor.apply(this, arguments);
      }

      DateFilterView.prototype.render = function() {
        DateFilterView.__super__.render.apply(this, arguments);
        return this.detailsView.$('input').prop('placeholder', '1970-01-31').datepicker({
          dateFormat: 'yy-mm-dd',
          changeMonth: true,
          changeYear: true
        });
      };

      return DateFilterView;

    })(StringFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/query-filter-view',['backbone', 'backbone.marionette', 'navigator/filters/base-filters', 'navigator/filters/string-filters', 'navigator/filters/choice-filters', 'templates/coding-rules', 'common/handlebars-extensions'], function(Backbone, Marionette, BaseFilters, StringFilterView, ChoiceFilters, Templates) {
    var QueryFilterView;
    return QueryFilterView = (function(_super) {
      __extends(QueryFilterView, _super);

      function QueryFilterView() {
        return QueryFilterView.__super__.constructor.apply(this, arguments);
      }

      QueryFilterView.prototype.template = Templates['coding-rules-query-filter'];

      QueryFilterView.prototype.className = 'navigator-filter navigator-filter-query';

      QueryFilterView.prototype.events = {
        'keypress input': 'checkSubmit',
        'change input': 'change',
        'click': 'focus',
        'blur': 'blur'
      };

      QueryFilterView.prototype.change = function(e) {
        this.model.set('value', $j(e.target).val());
        return this.options.app.codingRules.sorting = {
          sort: '',
          asc: ''
        };
      };

      QueryFilterView.prototype.clear = function() {
        QueryFilterView.__super__.clear.apply(this, arguments);
        return this.focus();
      };

      QueryFilterView.prototype.focus = function() {
        return this.$(':input').focus();
      };

      QueryFilterView.prototype.blur = function() {
        return this.$(':input').blur();
      };

      QueryFilterView.prototype.serializeData = function() {
        return _.extend({}, this.model.toJSON(), {
          value: this.model.get('value') || ''
        });
      };

      QueryFilterView.prototype.initialize = function() {
        QueryFilterView.__super__.initialize.call(this, {
          detailsView: null
        });
        if (!this.model.get('size')) {
          return this.model.set('size', 25);
        }
      };

      QueryFilterView.prototype.checkSubmit = function(e) {
        if (e.which === 13) {
          e.preventDefault();
          this.change(e);
          this.blur();
          this.options.app.filterBarView.$('.navigator-filter-submit').focus();
          return this.options.app.filterBarView.$('.navigator-filter-submit').click();
        }
      };

      QueryFilterView.prototype.renderInput = function() {};

      QueryFilterView.prototype.toggleDetails = function() {};

      QueryFilterView.prototype.isDefaultValue = function() {
        return true;
      };

      QueryFilterView.prototype.renderBase = function() {
        QueryFilterView.__super__.renderBase.apply(this, arguments);
        return this.$el.prop('title', '');
      };

      return QueryFilterView;

    })(StringFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/quality-profile-filter-view',['navigator/filters/choice-filters', 'templates/coding-rules'], function(ChoiceFilters, Templates) {
    var QualityProfileDetailFilterView, QualityProfileFilterView;
    QualityProfileDetailFilterView = (function(_super) {
      __extends(QualityProfileDetailFilterView, _super);

      function QualityProfileDetailFilterView() {
        return QualityProfileDetailFilterView.__super__.constructor.apply(this, arguments);
      }

      QualityProfileDetailFilterView.prototype.itemTemplate = Templates['coding-rules-profile-filter-detail'];

      return QualityProfileDetailFilterView;

    })(ChoiceFilters.DetailsChoiceFilterView);
    return QualityProfileFilterView = (function(_super) {
      __extends(QualityProfileFilterView, _super);

      function QualityProfileFilterView() {
        return QualityProfileFilterView.__super__.constructor.apply(this, arguments);
      }

      QualityProfileFilterView.prototype.initialize = function() {
        QualityProfileFilterView.__super__.initialize.call(this, {
          detailsView: QualityProfileDetailFilterView
        });
        this.app = this.model.get('app');
        this.allProfiles = this.model.get('choices');
        this.updateChoices(this.allProfiles);
        this.listenTo(this.app.languageFilter, 'change:value', this.onChangeLanguage);
        return this.onChangeLanguage();
      };

      QualityProfileFilterView.prototype.onChangeLanguage = function() {
        var languages;
        languages = this.app.languageFilter.get('value');
        if (_.isArray(languages) && languages.length > 0) {
          return this.filterLanguages(languages);
        } else {
          return this.updateChoices(this.allProfiles);
        }
      };

      QualityProfileFilterView.prototype.filterLanguages = function(languages) {
        var languageProfiles;
        languageProfiles = _.filter(this.allProfiles, function(prof) {
          return languages.indexOf(prof.lang) >= 0;
        });
        return this.updateChoices(languageProfiles);
      };

      QualityProfileFilterView.prototype.updateChoices = function(collection) {
        var currentValue, languages;
        languages = this.app.languages;
        currentValue = this.model.get('value');
        this.choices = new Backbone.Collection(_.map(collection, function(item, index) {
          return new Backbone.Model({
            id: item.key,
            text: item.name,
            checked: false,
            index: index,
            language: languages[item.lang]
          });
        }), {
          comparator: 'index'
        });
        if (currentValue) {
          this.restore(currentValue);
        }
        return this.render();
      };

      QualityProfileFilterView.prototype.render = function() {
        QualityProfileFilterView.__super__.render.apply(this, arguments);
        if (this.model.get('value')) {
          return this.$el.addClass('navigator-filter-context');
        } else {
          return this.$el.removeClass('navigator-filter-context');
        }
      };

      return QualityProfileFilterView;

    })(ChoiceFilters.ChoiceFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/profile-dependent-filter-view',['navigator/filters/choice-filters'], function(ChoiceFilters) {
    var ProfileDependentFilterView;
    return ProfileDependentFilterView = (function(_super) {
      __extends(ProfileDependentFilterView, _super);

      function ProfileDependentFilterView() {
        return ProfileDependentFilterView.__super__.constructor.apply(this, arguments);
      }

      ProfileDependentFilterView.prototype.tooltip = 'coding_rules.filters.activation.help';

      ProfileDependentFilterView.prototype.initialize = function() {
        ProfileDependentFilterView.__super__.initialize.apply(this, arguments);
        this.qualityProfileFilter = this.model.get('qualityProfileFilter');
        this.listenTo(this.qualityProfileFilter, 'change:value', this.onChangeQualityProfile);
        return this.onChangeQualityProfile();
      };

      ProfileDependentFilterView.prototype.onChangeQualityProfile = function() {
        var qualityProfileKey;
        qualityProfileKey = this.qualityProfileFilter.get('value');
        if (_.isArray(qualityProfileKey) && qualityProfileKey.length === 1) {
          return this.makeActive();
        } else {
          return this.makeInactive();
        }
      };

      ProfileDependentFilterView.prototype.makeActive = function() {
        this.model.set({
          inactive: false,
          title: ''
        });
        this.model.trigger('change:enabled');
        this.$el.removeClass('navigator-filter-inactive').prop('title', '');
        this.options.filterBarView.moreCriteriaFilter.view.detailsView.enableByProperty(this.detailsView.model.get('property'));
        return this.hideDetails();
      };

      ProfileDependentFilterView.prototype.makeInactive = function() {
        this.model.set({
          inactive: true,
          title: t(this.tooltip)
        });
        this.model.trigger('change:enabled');
        this.choices.each(function(model) {
          return model.set('checked', false);
        });
        this.detailsView.updateLists();
        this.detailsView.updateValue();
        return this.$el.addClass('navigator-filter-inactive').prop('title', t(this.tooltip));
      };

      ProfileDependentFilterView.prototype.showDetails = function() {
        if (!this.$el.is('.navigator-filter-inactive')) {
          return ProfileDependentFilterView.__super__.showDetails.apply(this, arguments);
        }
      };

      ProfileDependentFilterView.prototype.restore = function(value) {
        if (_.isString(value)) {
          value = value.split(',');
        }
        if (this.choices && value.length > 0) {
          this.model.set({
            value: value,
            enabled: true
          });
          this.choices.each(function(item) {
            return item.set('checked', false);
          });
          _.each(value, (function(_this) {
            return function(v) {
              var cModel;
              cModel = _this.choices.findWhere({
                id: v
              });
              return cModel.set('checked', true);
            };
          })(this));
          return this.onChangeQualityProfile();
        } else {
          return this.clear();
        }
      };

      return ProfileDependentFilterView;

    })(ChoiceFilters.ChoiceFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/inheritance-filter-view',['coding-rules/views/filters/profile-dependent-filter-view'], function(ProfileDependentFilterView) {
    var InheritanceFilterView;
    return InheritanceFilterView = (function(_super) {
      __extends(InheritanceFilterView, _super);

      function InheritanceFilterView() {
        return InheritanceFilterView.__super__.constructor.apply(this, arguments);
      }

      InheritanceFilterView.prototype.tooltip = 'coding_rules.filters.inheritance.inactive';

      InheritanceFilterView.prototype.onChangeQualityProfile = function() {
        var parentQualityProfile, qualityProfile, qualityProfileKey;
        qualityProfileKey = this.qualityProfileFilter.get('value');
        if (_.isArray(qualityProfileKey) && qualityProfileKey.length === 1) {
          qualityProfile = this.options.app.getQualityProfileByKey(qualityProfileKey[0]);
          if (qualityProfile.parentKey) {
            parentQualityProfile = this.options.app.getQualityProfile(qualityProfile.parentKey);
            if (parentQualityProfile) {
              return this.makeActive();
            } else {
              return this.makeInactive();
            }
          } else {
            return this.makeInactive();
          }
        } else {
          return this.makeInactive();
        }
      };

      return InheritanceFilterView;

    })(ProfileDependentFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/active-severities-filter-view',['coding-rules/views/filters/profile-dependent-filter-view'], function(ProfileDependentFilterView) {
    var ActiveSeveritiesFilterView;
    return ActiveSeveritiesFilterView = (function(_super) {
      __extends(ActiveSeveritiesFilterView, _super);

      function ActiveSeveritiesFilterView() {
        return ActiveSeveritiesFilterView.__super__.constructor.apply(this, arguments);
      }

      ActiveSeveritiesFilterView.prototype.tooltip = 'coding_rules.filters.active_severity.inactive';

      return ActiveSeveritiesFilterView;

    })(ProfileDependentFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/activation-filter-view',['coding-rules/views/filters/profile-dependent-filter-view'], function(ProfileDependentFilterView) {
    var ActivationFilterView;
    return ActivationFilterView = (function(_super) {
      __extends(ActivationFilterView, _super);

      function ActivationFilterView() {
        return ActivationFilterView.__super__.constructor.apply(this, arguments);
      }

      ActivationFilterView.prototype.tooltip = 'coding_rules.filters.activation.help';

      ActivationFilterView.prototype.makeActive = function() {
        var filterValue;
        ActivationFilterView.__super__.makeActive.apply(this, arguments);
        filterValue = this.model.get('value');
        if (!filterValue || filterValue.length === 0) {
          this.choices.each(function(model) {
            return model.set('checked', model.id === 'true');
          });
          this.model.set('value', ['true']);
          return this.detailsView.updateLists();
        }
      };

      ActivationFilterView.prototype.showDetails = function() {
        if (!this.$el.is('.navigator-filter-inactive')) {
          return ActivationFilterView.__super__.showDetails.apply(this, arguments);
        }
      };

      ActivationFilterView.prototype.restore = function(value) {
        if (_.isString(value)) {
          value = value.split(',');
        }
        if (this.choices && value.length > 0) {
          this.choices.each(function(model) {
            return model.set('checked', value.indexOf(model.id) >= 0);
          });
          this.model.set({
            value: value,
            enabled: true
          });
          return this.onChangeQualityProfile();
        } else {
          return this.clear();
        }
      };

      return ActivationFilterView;

    })(ProfileDependentFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/characteristic-filter-view',['navigator/filters/choice-filters'], function(ChoiceFilters) {
    var CharacteriticFilterView;
    return CharacteriticFilterView = (function(_super) {
      __extends(CharacteriticFilterView, _super);

      function CharacteriticFilterView() {
        return CharacteriticFilterView.__super__.constructor.apply(this, arguments);
      }

      CharacteriticFilterView.prototype.initialize = function() {
        CharacteriticFilterView.__super__.initialize.apply(this, arguments);
        this.choices.comparator = 'text';
        return this.choices.sort();
      };

      return CharacteriticFilterView;

    })(ChoiceFilters.ChoiceFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/repository-filter-view',['navigator/filters/choice-filters', 'templates/coding-rules'], function(ChoiceFilters, Templates) {
    var RepositoryDetailFilterView, RepositoryFilterView;
    RepositoryDetailFilterView = (function(_super) {
      __extends(RepositoryDetailFilterView, _super);

      function RepositoryDetailFilterView() {
        return RepositoryDetailFilterView.__super__.constructor.apply(this, arguments);
      }

      RepositoryDetailFilterView.prototype.itemTemplate = Templates['coding-rules-repository-detail'];

      return RepositoryDetailFilterView;

    })(ChoiceFilters.DetailsChoiceFilterView);
    return RepositoryFilterView = (function(_super) {
      __extends(RepositoryFilterView, _super);

      function RepositoryFilterView() {
        return RepositoryFilterView.__super__.constructor.apply(this, arguments);
      }

      RepositoryFilterView.prototype.initialize = function() {
        RepositoryFilterView.__super__.initialize.call(this, {
          detailsView: RepositoryDetailFilterView
        });
        this.app = this.model.get('app');
        this.allRepositories = this.model.get('choices');
        this.updateChoices(this.allRepositories);
        this.listenTo(this.app.languageFilter, 'change:value', this.onChangeLanguage);
        return this.onChangeLanguage();
      };

      RepositoryFilterView.prototype.onChangeLanguage = function() {
        var languages;
        languages = this.app.languageFilter.get('value');
        if (_.isArray(languages) && languages.length > 0) {
          return this.filterLanguages(languages);
        } else {
          return this.updateChoices(this.allRepositories);
        }
      };

      RepositoryFilterView.prototype.filterLanguages = function(languages) {
        var languageRepositories;
        languageRepositories = _.filter(this.allRepositories, function(repo) {
          return languages.indexOf(repo.language) >= 0;
        });
        return this.updateChoices(languageRepositories);
      };

      RepositoryFilterView.prototype.updateChoices = function(collection) {
        var currentValue, languages;
        languages = this.app.languages;
        currentValue = this.model.get('value');
        this.choices = new Backbone.Collection(_.map(collection, function(item, index) {
          return new Backbone.Model({
            id: item.key,
            text: item.name,
            checked: false,
            index: index,
            language: languages[item.language]
          });
        }), {
          comparator: function(item) {
            return [item.get('text'), item.get('language')];
          }
        });
        if (currentValue) {
          this.restore(currentValue);
        }
        return this.render();
      };

      return RepositoryFilterView;

    })(ChoiceFilters.ChoiceFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/tag-filter-view',['navigator/filters/choice-filters'], function(ChoiceFilters) {
    var TagFilterView;
    return TagFilterView = (function(_super) {
      __extends(TagFilterView, _super);

      function TagFilterView() {
        return TagFilterView.__super__.constructor.apply(this, arguments);
      }

      TagFilterView.prototype.initialize = function() {
        TagFilterView.__super__.initialize.call(this);
        return this.loadTags();
      };

      TagFilterView.prototype.loadTags = function() {
        var tagsXHR;
        tagsXHR = jQuery.ajax({
          url: "" + baseUrl + "/api/rules/tags",
          async: false
        });
        return jQuery.when(tagsXHR).done((function(_this) {
          return function(r) {
            _this.choices = new Backbone.Collection(_.map(r.tags, function(tag) {
              return new Backbone.Model({
                id: tag,
                text: tag
              });
            }), {
              comparator: 'text'
            });
            if (_this.tagToRestore) {
              _this.restore(_this.tagToRestore);
              _this.tagToRestore = null;
            }
            return _this.render();
          };
        })(this));
      };

      TagFilterView.prototype.restore = function(value) {
        if (!this.choices.isEmpty()) {
          return TagFilterView.__super__.restore.call(this, value);
        } else {
          return this.tagToRestore = value;
        }
      };

      return TagFilterView;

    })(ChoiceFilters.ChoiceFilterView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('coding-rules/views/filters/language-filter-view',['navigator/filters/choice-filters', 'templates/coding-rules'], function(ChoiceFilters, Templates) {
    var LanguageFilterView;
    return LanguageFilterView = (function(_super) {
      __extends(LanguageFilterView, _super);

      function LanguageFilterView() {
        return LanguageFilterView.__super__.constructor.apply(this, arguments);
      }

      LanguageFilterView.prototype.modelEvents = {
        'change:value': 'onChangeValue',
        'change:enabled': 'focus'
      };

      LanguageFilterView.prototype.initialize = function() {
        LanguageFilterView.__super__.initialize.apply(this, arguments);
        this.choices.comparator = 'text';
        this.choices.sort();
        this.app = this.model.get('app');
        this.listenTo(this.app.qualityProfileFilter, 'change:value', this.onChangeProfile);
        return this.selectedFromProfile = false;
      };

      LanguageFilterView.prototype.onChangeProfile = function() {
        var profile, profiles;
        profiles = this.app.qualityProfileFilter.get('value');
        if (_.isArray(profiles) && profiles.length > 0) {
          profile = _.findWhere(this.app.qualityProfiles, {
            key: profiles[0]
          });
          this.options.filterBarView.moreCriteriaFilter.view.detailsView.enableByProperty(this.detailsView.model.get('property'));
          this.choices.each(function(item) {
            return item.set('checked', item.id === profile.lang);
          });
          this.refreshValues();
          return this.selectedFromProfile = true;
        } else if (this.selectedFromProfile) {
          this.choices.each(function(item) {
            return item.set('checked', false);
          });
          return this.refreshValues();
        }
      };

      LanguageFilterView.prototype.onChangeValue = function() {
        this.selectedFromProfile = false;
        return this.renderBase();
      };

      LanguageFilterView.prototype.refreshValues = function() {
        this.detailsView.updateValue();
        this.detailsView.updateLists();
        this.render();
        return this.hideDetails();
      };

      return LanguageFilterView;

    })(ChoiceFilters.ChoiceFilterView);
  });

}).call(this);

(function() {
  requirejs.config({
    baseUrl: "" + baseUrl + "/js",
    paths: {
      'backbone': 'third-party/backbone',
      'backbone.marionette': 'third-party/backbone.marionette',
      'handlebars': 'third-party/handlebars'
    },
    shim: {
      'backbone.marionette': {
        deps: ['backbone'],
        exports: 'Marionette'
      },
      'backbone': {
        exports: 'Backbone'
      },
      'handlebars': {
        exports: 'Handlebars'
      }
    }
  });

  requirejs(['backbone', 'backbone.marionette', 'coding-rules/layout', 'coding-rules/router', 'coding-rules/views/header-view', 'coding-rules/views/actions-view', 'coding-rules/views/filter-bar-view', 'coding-rules/views/coding-rules-list-view', 'coding-rules/views/coding-rules-detail-view', 'coding-rules/views/coding-rules-bulk-change-view', 'coding-rules/views/coding-rules-quality-profile-activation-view', 'coding-rules/views/coding-rules-bulk-change-dropdown-view', 'coding-rules/views/coding-rules-facets-view', 'coding-rules/views/coding-rules-custom-rule-creation-view', 'coding-rules/views/coding-rules-manual-rule-creation-view', 'navigator/filters/base-filters', 'navigator/filters/choice-filters', 'navigator/filters/string-filters', 'navigator/filters/date-filter-view', 'navigator/filters/read-only-filters', 'coding-rules/views/filters/query-filter-view', 'coding-rules/views/filters/quality-profile-filter-view', 'coding-rules/views/filters/inheritance-filter-view', 'coding-rules/views/filters/active-severities-filter-view', 'coding-rules/views/filters/activation-filter-view', 'coding-rules/views/filters/characteristic-filter-view', 'coding-rules/views/filters/repository-filter-view', 'coding-rules/views/filters/tag-filter-view', 'coding-rules/views/filters/language-filter-view', 'common/handlebars-extensions'], function(Backbone, Marionette, CodingRulesLayout, CodingRulesRouter, CodingRulesHeaderView, CodingRulesActionsView, CodingRulesFilterBarView, CodingRulesListView, CodingRulesDetailView, CodingRulesBulkChangeView, CodingRulesQualityProfileActivationView, CodingRulesBulkChangeDropdownView, CodingRulesFacetsView, CodingRulesCustomRuleCreationView, CodingRulesManualRuleCreationView, BaseFilters, ChoiceFilters, StringFilterView, DateFilterView, ReadOnlyFilterView, QueryFilterView, QualityProfileFilterView, InheritanceFilterView, ActiveSeveritiesFilterView, ActivationFilterView, CharacteristicFilterView, RepositoryFilterView, TagFilterView, LanguageFilterView) {
    var App, appXHR, l10nXHR;
    jQuery.ajaxSetup({
      error: function(jqXHR) {
        var errorBox, text, _ref;
        text = jqXHR.responseText;
        errorBox = jQuery('.modal-error');
        if (((_ref = jqXHR.responseJSON) != null ? _ref.errors : void 0) != null) {
          text = _.pluck(jqXHR.responseJSON.errors, 'msg').join('. ');
        } else {
          text = t('default_error_message');
        }
        if (errorBox.length > 0) {
          return errorBox.show().text(text);
        } else {
          return alert(text);
        }
      }
    });
    jQuery('html').addClass('navigator-page coding-rules-page');
    App = new Marionette.Application;
    App.getQuery = function() {
      return this.filterBarView.getQuery();
    };
    App.restoreSorting = function(params) {
      var asc, sort;
      sort = _.findWhere(params, {
        key: 'sort'
      });
      asc = _.findWhere(params, {
        key: 'asc'
      });
      if ((sort != null) && (asc != null)) {
        return this.codingRules.sorting = {
          sort: sort.value,
          asc: asc.value === 'true'
        };
      }
    };
    App.restoreDefaultSorting = function() {
      var params;
      params = [];
      params.push({
        key: 'sort',
        value: 'createdAt'
      });
      params.push({
        key: 'asc',
        value: false
      });
      return this.restoreSorting(params);
    };
    App.storeQuery = function(query, sorting) {
      var queryString;
      if (sorting && sorting.sort) {
        _.extend(query, {
          s: sorting.sort,
          asc: '' + sorting.asc
        });
      }
      queryString = _.map(query, function(v, k) {
        return "" + k + "=" + (encodeURIComponent(v));
      });
      return this.router.navigate(queryString.join('|'), {
        replace: true
      });
    };
    App.fetchList = function(firstPage) {
      var fetchQuery, query, scrollOffset;
      query = this.getQuery();
      fetchQuery = _.extend({
        p: this.pageIndex,
        ps: 25,
        facets: firstPage
      }, query);
      if (this.codingRules.sorting && this.codingRules.sorting.sort) {
        _.extend(fetchQuery, {
          s: this.codingRules.sorting.sort,
          asc: this.codingRules.sorting.asc
        });
      }
      this.storeQuery(query, this.codingRules.sorting);
      _.extend(fetchQuery, {
        f: 'name,lang,status,tags,sysTags'
      });
      if (this.codingRulesListView) {
        scrollOffset = jQuery('.navigator-results')[0].scrollTop;
      } else {
        scrollOffset = 0;
      }
      this.layout.showSpinner('resultsRegion');
      if (firstPage) {
        this.layout.showSpinner('facetsRegion');
      }
      return jQuery.ajax({
        url: "" + baseUrl + "/api/rules/search",
        data: fetchQuery
      }).done((function(_this) {
        return function(r) {
          _.map(r.rules, function(rule) {
            return rule.language = App.languages[rule.lang];
          });
          _this.codingRules.paging = {
            total: r.total,
            pageIndex: r.p,
            pageSize: r.ps,
            pages: 1 + (r.total / r.ps)
          };
          if (_this.codingRulesListView) {
            _this.codingRulesListView.close();
          }
          if (firstPage) {
            _this.codingRules.reset(r.rules);
            _this.codingRulesListView = new CodingRulesListView({
              app: _this,
              collection: _this.codingRules
            });
          } else {
            _this.codingRulesListView.unbindEvents();
            _this.codingRules.add(r.rules);
          }
          _this.layout.resultsRegion.show(_this.codingRulesListView);
          if (_this.codingRules.isEmpty()) {
            _this.layout.detailsRegion.reset();
          } else if (firstPage) {
            _this.codingRulesListView.selectFirst();
          } else {
            _this.codingRulesListView.selectCurrent();
          }
          if (firstPage) {
            _this.codingRulesFacetsView = new CodingRulesFacetsView({
              app: _this,
              collection: new Backbone.Collection(r.facets, {
                comparator: 'property'
              })
            });
            _this.layout.facetsRegion.show(_this.codingRulesFacetsView);
            _this.filterBarView.restoreFromWsQuery(query);
            _this.codingRulesFacetsView.restoreFromQuery(query);
          } else {
            jQuery('.navigator-results')[0].scrollTop = scrollOffset;
          }
          return _this.layout.onResize();
        };
      })(this));
    };
    App.facetLabel = function(property, value) {
      if (!App.facetPropertyToLabels[property]) {
        return value;
      }
      return App.facetPropertyToLabels[property](value);
    };
    App.fetchFirstPage = function() {
      this.pageIndex = 1;
      return App.fetchList(true);
    };
    App.fetchNextPage = function() {
      if (this.pageIndex < this.codingRules.paging.pages) {
        this.pageIndex++;
        return App.fetchList(false);
      }
    };
    App.getQualityProfile = function() {
      var value;
      value = this.qualityProfileFilter.get('value');
      if ((value != null) && value.length === 1) {
        return value[0];
      } else {
        return null;
      }
    };
    App.getQualityProfilesForLanguage = function(language_key) {
      return _.filter(App.qualityProfiles, (function(_this) {
        return function(p) {
          return p.lang === language_key;
        };
      })(this));
    };
    App.getQualityProfileByKey = function(profile_key) {
      return _.findWhere(App.qualityProfiles, {
        key: profile_key
      });
    };
    App.getSubcharacteristicName = function(name) {
      return (App.characteristics[name] || '').replace(': ', ' > ');
    };
    App.showRule = function(ruleKey) {
      App.layout.showSpinner('detailsRegion');
      return jQuery.ajax({
        url: "" + baseUrl + "/api/rules/show",
        data: {
          key: ruleKey,
          actives: true
        }
      }).done((function(_this) {
        return function(r) {
          var rule;
          rule = new Backbone.Model(r.rule);
          App.codingRulesQualityProfileActivationView.rule = rule;
          App.detailView = new CodingRulesDetailView({
            app: App,
            model: rule,
            actives: r.actives
          });
          return App.layout.detailsRegion.show(App.detailView);
        };
      })(this));
    };
    App.manualRepository = function() {
      return {
        key: 'manual',
        name: 'Manual Rules',
        language: 'none'
      };
    };
    App.createManualRule = function() {
      App.codingRulesManualRuleCreationView.model = new Backbone.Model();
      return App.codingRulesManualRuleCreationView.show();
    };
    App.addInitializer(function() {
      this.layout = new CodingRulesLayout({
        app: this
      });
      jQuery('#content').append(this.layout.render().el);
      return this.layout.onResize();
    });
    App.addInitializer(function() {
      this.codingRulesHeaderView = new CodingRulesHeaderView({
        app: this
      });
      return this.layout.headerRegion.show(this.codingRulesHeaderView);
    });
    App.addInitializer(function() {
      this.codingRules = new Backbone.Collection;
      return this.restoreDefaultSorting();
    });
    App.addInitializer(function() {
      this.codingRulesActionsView = new CodingRulesActionsView({
        app: this,
        collection: this.codingRules
      });
      return this.layout.actionsRegion.show(this.codingRulesActionsView);
    });
    App.addInitializer(function() {
      this.codingRulesBulkChangeView = new CodingRulesBulkChangeView({
        app: this
      });
      return this.codingRulesBulkChangeDropdownView = new CodingRulesBulkChangeDropdownView({
        app: this
      });
    });
    App.addInitializer(function() {
      return this.codingRulesQualityProfileActivationView = new CodingRulesQualityProfileActivationView({
        app: this
      });
    });
    App.addInitializer(function() {
      return this.codingRulesCustomRuleCreationView = new CodingRulesCustomRuleCreationView({
        app: this
      });
    });
    App.addInitializer(function() {
      return this.codingRulesManualRuleCreationView = new CodingRulesManualRuleCreationView({
        app: this
      });
    });
    App.addInitializer(function() {
      this.filters = new BaseFilters.Filters;
      this.queryFilter = new BaseFilters.Filter({
        property: 'q',
        type: QueryFilterView,
        size: 50
      });
      this.filters.add(this.queryFilter);
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.severity'),
        property: 'severities',
        type: ChoiceFilters.ChoiceFilterView,
        optional: true,
        choices: {
          'BLOCKER': t('severity.BLOCKER'),
          'CRITICAL': t('severity.CRITICAL'),
          'MAJOR': t('severity.MAJOR'),
          'MINOR': t('severity.MINOR'),
          'INFO': t('severity.INFO')
        },
        choiceIcons: {
          'BLOCKER': 'severity-blocker',
          'CRITICAL': 'severity-critical',
          'MAJOR': 'severity-major',
          'MINOR': 'severity-minor',
          'INFO': 'severity-info'
        }
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.tag'),
        property: 'tags',
        type: TagFilterView,
        optional: true
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.characteristic'),
        property: 'debt_characteristics',
        type: CharacteristicFilterView,
        choices: this.characteristics,
        multiple: false,
        optional: true
      }));
      this.qualityProfileFilter = new BaseFilters.Filter({
        name: t('coding_rules.filters.quality_profile'),
        property: 'qprofile',
        type: QualityProfileFilterView,
        app: this,
        choices: this.qualityProfiles,
        multiple: false
      });
      this.filters.add(this.qualityProfileFilter);
      this.activationFilter = new BaseFilters.Filter({
        name: t('coding_rules.filters.activation'),
        property: 'activation',
        type: ActivationFilterView,
        enabled: false,
        optional: true,
        multiple: false,
        qualityProfileFilter: this.qualityProfileFilter,
        choices: {
          "true": t('coding_rules.filters.activation.active'),
          "false": t('coding_rules.filters.activation.inactive')
        }
      });
      this.filters.add(this.activationFilter);
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.active_severity'),
        property: 'active_severities',
        type: ActiveSeveritiesFilterView,
        enabled: false,
        optional: true,
        qualityProfileFilter: this.qualityProfileFilter,
        choices: {
          'BLOCKER': t('severity.BLOCKER'),
          'CRITICAL': t('severity.CRITICAL'),
          'MAJOR': t('severity.MAJOR'),
          'MINOR': t('severity.MINOR'),
          'INFO': t('severity.INFO')
        },
        choiceIcons: {
          'BLOCKER': 'severity-blocker',
          'CRITICAL': 'severity-critical',
          'MAJOR': 'severity-major',
          'MINOR': 'severity-minor',
          'INFO': 'severity-info'
        }
      }));
      this.languageFilter = new BaseFilters.Filter({
        name: t('coding_rules.filters.language'),
        property: 'languages',
        type: LanguageFilterView,
        app: this,
        choices: this.languages,
        optional: true
      });
      this.filters.add(this.languageFilter);
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.availableSince'),
        property: 'available_since',
        type: DateFilterView,
        enabled: false,
        optional: true
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.inheritance'),
        property: 'inheritance',
        type: InheritanceFilterView,
        enabled: false,
        optional: true,
        multiple: false,
        qualityProfileFilter: this.qualityProfileFilter,
        choices: {
          'NONE': t('coding_rules.filters.inheritance.not_inherited'),
          'INHERITED': t('coding_rules.filters.inheritance.inherited'),
          'OVERRIDES': t('coding_rules.filters.inheritance.overriden')
        }
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.repository'),
        property: 'repositories',
        type: RepositoryFilterView,
        enabled: false,
        optional: true,
        app: this,
        choices: this.repositories
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.status'),
        property: 'statuses',
        type: ChoiceFilters.ChoiceFilterView,
        enabled: false,
        optional: true,
        choices: this.statuses
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.template'),
        property: 'is_template',
        type: ChoiceFilters.ChoiceFilterView,
        optional: true,
        multiple: false,
        choices: {
          'true': t('coding_rules.filters.template.is_template'),
          'false': t('coding_rules.filters.template.is_not_template')
        }
      }));
      this.filters.add(new BaseFilters.Filter({
        name: t('coding_rules.filters.key'),
        property: 'rule_key',
        type: ReadOnlyFilterView,
        enabled: false,
        optional: true
      }));
      this.filterBarView = new CodingRulesFilterBarView({
        app: this,
        collection: this.filters,
        extra: {
          sort: '',
          asc: false
        }
      });
      return this.layout.filtersRegion.show(this.filterBarView);
    });
    App.addInitializer(function() {
      this.router = new CodingRulesRouter({
        app: this
      });
      return Backbone.history.start();
    });
    appXHR = jQuery.ajax({
      url: "" + baseUrl + "/api/rules/app"
    }).done(function(r) {
      App.appState = new Backbone.Model;
      App.state = new Backbone.Model;
      App.canWrite = r.canWrite;
      App.qualityProfiles = _.sortBy(r.qualityprofiles, ['name', 'lang']);
      App.languages = _.extend(r.languages, {
        none: 'None'
      });
      _.map(App.qualityProfiles, function(profile) {
        return profile.language = App.languages[profile.lang];
      });
      App.repositories = r.repositories;
      App.repositories.push(App.manualRepository());
      App.statuses = r.statuses;
      App.characteristics = r.characteristics;
      return App.facetPropertyToLabels = {
        'languages': function(value) {
          return App.languages[value];
        },
        'repositories': function(value) {
          var other_repo_with_same_name, repo;
          repo = _.findWhere(App.repositories, {
            key: value
          });
          other_repo_with_same_name = _.find(App.repositories, function(repos) {
            return repos.name === repo.name && repos.key !== repo.key;
          });
          if (other_repo_with_same_name) {
            return App.languages[repo.language] + ' ' + repo.name;
          } else {
            return repo.name;
          }
        }
      };
    });
    l10nXHR = window.requestMessages();
    return jQuery.when(l10nXHR, appXHR).done(function() {
      jQuery('#coding-rules-page-loader').remove();
      return App.start();
    });
  });

}).call(this);

define("coding-rules/app", function(){});

