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

define('templates/component-viewer',['handlebars'], function(Handlebars) {

this["SS"] = this["SS"] || {};
this["SS"]["Templates"] = this["SS"]["Templates"] || {};

Handlebars.registerPartial("_cw-header-item", Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;


  buffer += "<li><span class=\"item\" data-metric=\"";
  if (helper = helpers.label) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.label); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n  <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric", (depth0 && depth0.label), "name", options) : helperMissing.call(depth0, "t", "metric", (depth0 && depth0.label), "name", options)))
    + "</span>\n  <span class=\"number\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n</span></li>";
  return buffer;
  }));

Handlebars.registerPartial("_cw-header-link", Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;


  buffer += "<li><a class=\"item ";
  if (helper = helpers.cl) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.cl); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-metric=\"";
  if (helper = helpers.label) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.label); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n  <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric", (depth0 && depth0.label), "name", options) : helperMissing.call(depth0, "t", "metric", (depth0 && depth0.label), "name", options)))
    + "</span>\n  <span class=\"number\">";
  if (helper = helpers.value) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.value); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n  <i class=\"icon-component-viewer-filter\"></i>\n</a></li>\n";
  return buffer;
  }));

this["SS"]["Templates"]["cw-code-expand"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, self=this, functionType="function", escapeExpression=this.escapeExpression;

function program1(depth0,data) {
  
  
  return "\n    <td class=\"stat coverage-tests\"></td>\n    <td class=\"stat coverage-conditions\"></td>\n  ";
  }

function program3(depth0,data) {
  
  
  return "\n    <td class=\"stat\"></td>\n  ";
  }

  buffer += "<tr class=\"row row-expand\">\n  ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.coverage), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.duplications), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.scm), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  <td class=\"stat lid\">\n    <button class=\"button-clean js-expand\" data-from=\"";
  if (helper = helpers.from) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.from); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-to=\"";
  if (helper = helpers.to) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.to); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"><i class=\"icon-expand\"></i></button>\n  </td>\n  <td class=\"line\"></td>\n</tr>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-coverage-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n    <div class=\"bubble-popup-section\">\n      <a class=\"component-viewer-popup-test-file link-action\" data-key=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\" title=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.longName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">\n        "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.longName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n      </a>\n      <ul class=\"bubble-popup-list\">\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.tests), {hash:{},inverse:self.noop,fn:self.programWithDepth(2, program2, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </ul>\n    </div>\n  ";
  return buffer;
  }
function program2(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <li class=\"component-viewer-popup-test\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n            <i class=\"component-viewer-popup-test-status "
    + escapeExpression((helper = helpers.testStatusIconClass || (depth0 && depth0.testStatusIconClass),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.status), options) : helperMissing.call(depth0, "testStatusIconClass", (depth0 && depth0.status), options)))
    + "\"></i>\n            <span class=\"component-viewer-popup-test-name\">\n              <a class=\"component-viewer-popup-test-file link-action\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"\n                 data-key=\""
    + escapeExpression(((stack1 = ((stack1 = (depth1 && depth1.file)),stack1 == null || stack1 === false ? stack1 : stack1.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\" data-method=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n                ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n              </a>\n            </span>\n            <span class=\"component-viewer-popup-test-duration\">";
  if (helper = helpers.durationInMs) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.durationInMs); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "ms</span>\n          </li>\n        ";
  return buffer;
  }

  buffer += "<div class=\"bubble-popup-container\">\n  <div class=\"bubble-popup-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.transition.coverage", options) : helperMissing.call(depth0, "t", "component_viewer.transition.coverage", options)))
    + "</div>\n\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.testFiles), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-duplication-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <div class=\"bubble-popup-section\">\n      ";
  stack1 = (helper = helpers.notEqComponents || (depth0 && depth0.notEqComponents),options={hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.file), (depth1 && depth1.component), options) : helperMissing.call(depth0, "notEqComponents", (depth0 && depth0.file), (depth1 && depth1.component), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.key), ((stack1 = (depth1 && depth1.component)),stack1 == null || stack1 === false ? stack1 : stack1.key), options) : helperMissing.call(depth0, "notEq", ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.key), ((stack1 = (depth1 && depth1.component)),stack1 == null || stack1 === false ? stack1 : stack1.key), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      <div class=\"component-viewer-popup-duplications\">\n        Lines:\n        ";
  stack1 = (helper = helpers.joinEach || (depth0 && depth0.joinEach),options={hash:{},inverse:self.noop,fn:self.programWithDepth(6, program6, data, depth0),data:data},helper ? helper.call(depth0, (depth0 && depth0.blocks), ",", options) : helperMissing.call(depth0, "joinEach", (depth0 && depth0.blocks), ",", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </div>\n    </div>\n  ";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        <div class=\"component-viewer-popup-label\" title=\""
    + escapeExpression((helper = helpers.projectFullName || (depth0 && depth0.projectFullName),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.file), options) : helperMissing.call(depth0, "projectFullName", (depth0 && depth0.file), options)))
    + "\">\n          <i class=\"icon-qualifier-trk\"></i> "
    + escapeExpression((helper = helpers.projectFullName || (depth0 && depth0.projectFullName),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.file), options) : helperMissing.call(depth0, "projectFullName", (depth0 && depth0.file), options)))
    + "\n        </div>\n      ";
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n        <a class=\"link-action\" data-key=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\" title=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">\n          "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.file)),stack1 == null || stack1 === false ? stack1 : stack1.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n        </a>\n      ";
  return buffer;
  }

function program6(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <a class=\"link-action\" data-key=\""
    + escapeExpression(((stack1 = ((stack1 = (depth1 && depth1.file)),stack1 == null || stack1 === false ? stack1 : stack1.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\" data-line=\"";
  if (helper = helpers.from) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.from); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n            ";
  if (helper = helpers.from) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.from); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + " – "
    + escapeExpression((helper = helpers.sum || (depth0 && depth0.sum),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.from), (depth0 && depth0.size), options) : helperMissing.call(depth0, "sum", (depth0 && depth0.from), (depth0 && depth0.size), options)))
    + "\n          </a>\n        ";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "duplications.block_was_duplicated_by_a_deleted_resource", options) : helperMissing.call(depth0, "t", "duplications.block_was_duplicated_by_a_deleted_resource", options)))
    + "\n  ";
  return buffer;
  }

  buffer += "<div class=\"bubble-popup-container\">\n  <div class=\"bubble-popup-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.transition.duplication", options) : helperMissing.call(depth0, "t", "component_viewer.transition.duplication", options)))
    + "</div>\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.duplications), {hash:{},inverse:self.program(8, program8, data),fn:self.programWithDepth(1, program1, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.projectName), {hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      <div class=\"component-viewer-header-component-name\">\n        "
    + escapeExpression((helper = helpers.qualifierIcon || (depth0 && depth0.qualifierIcon),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.q), options) : helperMissing.call(depth0, "qualifierIcon", ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.q), options)))
    + " "
    + escapeExpression((helper = helpers['default'] || (depth0 && depth0['default']),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.path), ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.longName), options) : helperMissing.call(depth0, "default", ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.path), ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.longName), options)))
    + "\n\n        ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.canMarkAsFavourite), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </div>\n    ";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-header-component-project\">\n          "
    + escapeExpression((helper = helpers.qualifierIcon || (depth0 && depth0.qualifierIcon),options={hash:{},data:data},helper ? helper.call(depth0, "TRK", options) : helperMissing.call(depth0, "qualifierIcon", "TRK", options)))
    + "\n          <a class=\"link-action\" href=\""
    + escapeExpression((helper = helpers.dashboardUrl || (depth0 && depth0.dashboardUrl),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.project), options) : helperMissing.call(depth0, "dashboardUrl", ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.project), options)))
    + "\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.projectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</a>\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </div>\n      ";
  return buffer;
  }
function program3(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            / <a class=\"link-action\" href=\""
    + escapeExpression((helper = helpers.dashboardUrl || (depth0 && depth0.dashboardUrl),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProject), options) : helperMissing.call(depth0, "dashboardUrl", ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProject), options)))
    + "\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</a>\n          ";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n          <a class=\"js-favorite component-viewer-header-favorite\"\n             title=\"";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.fav), {hash:{},inverse:self.program(8, program8, data),fn:self.program(6, program6, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n            <i class=\"";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.fav), {hash:{},inverse:self.program(12, program12, data),fn:self.program(10, program10, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></i>\n          </a>\n        ";
  return buffer;
  }
function program6(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "click_to_remove_from_favorites", options) : helperMissing.call(depth0, "t", "click_to_remove_from_favorites", options)));
  }

function program8(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "click_to_add_to_favorites", options) : helperMissing.call(depth0, "t", "click_to_add_to_favorites", options)));
  }

function program10(depth0,data) {
  
  
  return "icon-favorite";
  }

function program12(depth0,data) {
  
  
  return "icon-not-favorite";
  }

function program14(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      <div class=\"component-viewer-header-component-project removed\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removedMessage)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</div>\n    ";
  return buffer;
  }

function program16(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <a class=\"js-actions component-viewer-header-actions\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.more_actions", options) : helperMissing.call(depth0, "t", "component_viewer.more_actions", options)))
    + "\">\n      <i class=\"icon-list\"></i>\n    </a>\n\n    <div class=\"component-viewer-header-measures\">\n      ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.isUnitTest), {hash:{},inverse:self.noop,fn:self.program(17, program17, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.isUnitTest), {hash:{},inverse:self.noop,fn:self.program(19, program19, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      <div class=\"component-viewer-header-measures-scope\">\n        <a data-scope=\"issues\" class=\"component-viewer-header-measures-expand js-header-tab-issues\">\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fSqaleRating), {hash:{},inverse:self.noop,fn:self.program(21, program21, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          <div class=\"component-viewer-header-measure\">\n            <span class=\"component-viewer-header-measure-value\">"
    + escapeExpression((helper = helpers['default'] || (depth0 && depth0['default']),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fDebt), "0", options) : helperMissing.call(depth0, "default", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fDebt), "0", options)))
    + "</span>\n            <span class=\"component-viewer-header-measure-label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.header.debt", options) : helperMissing.call(depth0, "t", "component_viewer.header.debt", options)))
    + "</span>\n          </div>\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fIssues), {hash:{},inverse:self.noop,fn:self.program(24, program24, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fIssues), {hash:{},inverse:self.noop,fn:self.program(26, program26, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          <i class=\"icon-dropdown\"></i>\n        </a>\n        <a data-scope=\"issues\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.header.toggle_issues", options) : helperMissing.call(depth0, "t", "component_viewer.header.toggle_issues", options)))
    + "\"\n           class=\"js-toggle-issues component-viewer-header-measures-toggle-scope ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.issues), {hash:{},inverse:self.noop,fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></a>\n      </div>\n\n      ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(30, program30, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.tabs), "coverage", options) : helperMissing.call(depth0, "inArray", ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.tabs), "coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(32, program32, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.tabs), "duplications", options) : helperMissing.call(depth0, "inArray", ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.tabs), "duplications", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(34, program34, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.tabs), "scm", options) : helperMissing.call(depth0, "inArray", ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.tabs), "scm", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </div>\n  ";
  return buffer;
  }
function program17(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-header-measures-scope\">\n          <a data-scope=\"tests\" class=\"component-viewer-header-measures-expand js-header-tab-tests\">\n            <div class=\"component-viewer-header-measure\">\n              <span class=\"component-viewer-header-measure-value\">"
    + escapeExpression(((stack1 = ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fTests)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</span>\n              <span class=\"component-viewer-header-measure-label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.tests.name", options) : helperMissing.call(depth0, "t", "metric.tests.name", options)))
    + "</span>\n            </div>\n            <i class=\"icon-dropdown\"></i>\n          </a>\n        </div>\n      ";
  return buffer;
  }

function program19(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-header-measures-scope\">\n          <span data-scope=\"basic\" class=\"js-toggle-coverage component-viewer-header-measures-toggle-scope inactive\"></span>\n          <a data-scope=\"basic\" class=\"component-viewer-header-measures-expand js-header-tab-basic\">\n            <div class=\"component-viewer-header-measure\">\n              <span class=\"component-viewer-header-measure-value\">"
    + escapeExpression((helper = helpers['default'] || (depth0 && depth0['default']),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fNcloc), "–", options) : helperMissing.call(depth0, "default", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fNcloc), "–", options)))
    + "</span>\n              <span class=\"component-viewer-header-measure-label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.ncloc.name", options) : helperMissing.call(depth0, "t", "metric.ncloc.name", options)))
    + "</span>\n            </div>\n            <i class=\"icon-dropdown\"></i>\n          </a>\n        </div>\n      ";
  return buffer;
  }

function program21(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n            <div class=\"component-viewer-header-measure\">\n              <span class=\"rating rating-"
    + escapeExpression(((stack1 = ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fSqaleRating)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\"\n                    ";
  stack1 = helpers['if'].call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fSqaleDebtRatio), {hash:{},inverse:self.noop,fn:self.program(22, program22, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n                "
    + escapeExpression(((stack1 = ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fSqaleRating)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n              </span>\n            </div>\n          ";
  return buffer;
  }
function program22(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.sqale_debt_ratio.name", options) : helperMissing.call(depth0, "t", "metric.sqale_debt_ratio.name", options)))
    + ": "
    + escapeExpression(((stack1 = ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fSqaleDebtRatio)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\"";
  return buffer;
  }

function program24(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <div class=\"component-viewer-header-measure\">\n              <span class=\"component-viewer-header-measure-value\">"
    + escapeExpression(((stack1 = ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fIssues)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</span>\n              <span class=\"component-viewer-header-measure-label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.violations.name", options) : helperMissing.call(depth0, "t", "metric.violations.name", options)))
    + "</span>\n            </div>\n          ";
  return buffer;
  }

function program26(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <div class=\"component-viewer-header-measure\">\n              <div class=\"component-viewer-header-measure-issues\">\n                <div class=\"component-viewer-header-measure-issue s-blocker\"\n                     style=\"width: "
    + escapeExpression((helper = helpers.percent || (depth0 && depth0.percent),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fBlockerIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options) : helperMissing.call(depth0, "percent", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fBlockerIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options)))
    + ";\"></div>\n                <div class=\"component-viewer-header-measure-issue s-critical\"\n                     style=\"width: "
    + escapeExpression((helper = helpers.percent || (depth0 && depth0.percent),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fCriticalIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options) : helperMissing.call(depth0, "percent", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fCriticalIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options)))
    + ";\"></div>\n                <div class=\"component-viewer-header-measure-issue s-major\"\n                     style=\"width: "
    + escapeExpression((helper = helpers.percent || (depth0 && depth0.percent),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fMajorIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options) : helperMissing.call(depth0, "percent", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fMajorIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options)))
    + ";\"></div>\n                <div class=\"component-viewer-header-measure-issue s-minor\"\n                     style=\"width: "
    + escapeExpression((helper = helpers.percent || (depth0 && depth0.percent),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fMinorIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options) : helperMissing.call(depth0, "percent", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fMinorIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options)))
    + ";\"></div>\n                <div class=\"component-viewer-header-measure-issue s-info\"\n                     style=\"width: "
    + escapeExpression((helper = helpers.percent || (depth0 && depth0.percent),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fInfoIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options) : helperMissing.call(depth0, "percent", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fInfoIssues), ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.maxIssues), options)))
    + ";\"></div>\n              </div>\n            </div>\n          ";
  return buffer;
  }

function program28(depth0,data) {
  
  
  return "active";
  }

function program30(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-header-measures-scope\">\n          <a data-scope=\"coverage\" class=\"component-viewer-header-measures-expand js-header-tab-coverage\">\n              <div class=\"component-viewer-header-measure\">\n                <span class=\"component-viewer-header-measure-value\">"
    + escapeExpression((helper = helpers['default'] || (depth0 && depth0['default']),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fCoverage), "–", options) : helperMissing.call(depth0, "default", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fCoverage), "–", options)))
    + "</span>\n                <span class=\"component-viewer-header-measure-label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.coverage.name", options) : helperMissing.call(depth0, "t", "metric.coverage.name", options)))
    + "</span>\n              </div>\n            <i class=\"icon-dropdown\"></i>\n          </a>\n          <a data-scope=\"coverage\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.header.toggle_coverage", options) : helperMissing.call(depth0, "t", "component_viewer.header.toggle_coverage", options)))
    + "\"\n             class=\"js-toggle-coverage component-viewer-header-measures-toggle-scope ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.coverage), {hash:{},inverse:self.noop,fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></a>\n        </div>\n      ";
  return buffer;
  }

function program32(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-header-measures-scope\">\n          <a data-scope=\"duplications\" class=\"component-viewer-header-measures-expand js-header-tab-duplications\">\n              <div class=\"component-viewer-header-measure\">\n                <span class=\"component-viewer-header-measure-value\">"
    + escapeExpression((helper = helpers['default'] || (depth0 && depth0['default']),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fDuplicationDensity), "–", options) : helperMissing.call(depth0, "default", ((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures)),stack1 == null || stack1 === false ? stack1 : stack1.fDuplicationDensity), "–", options)))
    + "</span>\n                <span class=\"component-viewer-header-measure-label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.duplicated_lines_density.name", options) : helperMissing.call(depth0, "t", "metric.duplicated_lines_density.name", options)))
    + "</span>\n              </div>\n            <i class=\"icon-dropdown\"></i>\n          </a>\n          <a data-scope=\"duplications\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.header.toggle_duplications", options) : helperMissing.call(depth0, "t", "component_viewer.header.toggle_duplications", options)))
    + "\"\n             class=\"js-toggle-duplications component-viewer-header-measures-toggle-scope ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.duplications), {hash:{},inverse:self.noop,fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></a>\n        </div>\n      ";
  return buffer;
  }

function program34(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-header-measures-scope\">\n          <a data-scope=\"scm\" class=\"component-viewer-header-measures-expand js-header-tab-scm\">\n            <div class=\"component-viewer-header-measure\">\n              <span class=\"component-viewer-header-measure-value\"><i class=\"icon-calendar\"></i></span>\n              <span class=\"component-viewer-header-measure-label\">SCM</span>\n            </div>\n            <i class=\"icon-dropdown\"></i>\n          </a>\n          <a data-scope=\"scm\" title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.header.toggle_scm", options) : helperMissing.call(depth0, "t", "component_viewer.header.toggle_scm", options)))
    + "\"\n             class=\"js-toggle-scm component-viewer-header-measures-toggle-scope ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.scm), {hash:{},inverse:self.noop,fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\"></a>\n        </div>\n      ";
  return buffer;
  }

  buffer += "<div class=\"component-viewer-header-bar\">\n  <div class=\"component-viewer-header-component\">\n    ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.program(14, program14, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n\n  ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.noop,fn:self.program(16, program16, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"component-viewer-header-expanded-bar\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-layout"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"component-viewer-header\"></div>\n<div class=\"component-viewer-workspace\"></div>\n<div class=\"component-viewer-source\"></div>";
  });

this["SS"]["Templates"]["cw-line-options-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <div class=\"bubble-popup-section\">\n      <a href=\"#\" class=\"js-add-manual-issue link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.add_manual_issue", options) : helperMissing.call(depth0, "t", "component_viewer.add_manual_issue", options)))
    + "</a>\n    </div>\n  ";
  return buffer;
  }

  buffer += "<div class=\"bubble-popup-container\">\n  <div class=\"bubble-popup-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.line_actions", options) : helperMissing.call(depth0, "t", "component_viewer.line_actions", options)))
    + "</div>\n\n  <div class=\"bubble-popup-section\">\n    <a href=\"#\" class=\"js-get-permalink link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.get_permalink", options) : helperMissing.call(depth0, "t", "component_viewer.get_permalink", options)))
    + "</a>\n  </div>\n\n  ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.canCreateManualIssue), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-more-actions"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  <br>\n  <a class=\"js-extension\" data-key=\""
    + escapeExpression(((stack1 = (depth0 && depth0[0])),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">"
    + escapeExpression(((stack1 = (depth0 && depth0[1])),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</a>\n";
  return buffer;
  }

  buffer += "<a class=\"js-new-window\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.new_window", options) : helperMissing.call(depth0, "t", "component_viewer.new_window", options)))
    + "</a>\n<br>\n<a class=\"js-full-source\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.show_full_source", options) : helperMissing.call(depth0, "t", "component_viewer.show_full_source", options)))
    + "</a>\n<br>\n<a class=\"js-raw-source\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.show_raw_source", options) : helperMissing.call(depth0, "t", "component_viewer.show_raw_source", options)))
    + "</a>\n\n";
  stack1 = helpers.each.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.extensions), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-source"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n\n  <p>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "code_viewer.no_source_code_displayed_due_to_security", options) : helperMissing.call(depth0, "t", "code_viewer.no_source_code_displayed_due_to_security", options)))
    + "</p>\n\n";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.issuesLimitReached), {hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n  ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.duplicationsInDeletedFiles), {hash:{},inverse:self.noop,fn:self.program(6, program6, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n  <table class=\"code\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.showZeroLine), {hash:{},inverse:self.noop,fn:self.program(8, program8, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.source), {hash:{},inverse:self.noop,fn:self.programWithDepth(13, program13, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </table>\n\n";
  return buffer;
  }
function program4(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <p class=\"message-alert marginbottom10\">"
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.issues_limit_reached", (depth0 && depth0.issuesLimit), options) : helperMissing.call(depth0, "tp", "component_viewer.issues_limit_reached", (depth0 && depth0.issuesLimit), options)))
    + "</p>\n  ";
  return buffer;
  }

function program6(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <p class=\"marginbottom10 js-duplications-in-deleted-files\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "duplications.dups_found_on_deleted_resource", options) : helperMissing.call(depth0, "t", "duplications.dups_found_on_deleted_resource", options)))
    + "</p>\n  ";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n      <tr class=\"row row-hidden\" data-line-number=\"0\" id=\"";
  if (helper = helpers.uid) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.uid); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "-0\">\n        ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.coverage), {hash:{},inverse:self.noop,fn:self.program(9, program9, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.duplications), {hash:{},inverse:self.noop,fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.scm), {hash:{},inverse:self.noop,fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        <td class=\"stat lid\"></td>\n        <td class=\"line\"></td>\n      </tr>\n    ";
  return buffer;
  }
function program9(depth0,data) {
  
  
  return "\n          <td class=\"stat coverage-tests\"></td>\n          <td class=\"stat coverage-conditions\"></td>\n        ";
  }

function program11(depth0,data) {
  
  
  return "\n          <td class=\"stat\"></td>\n        ";
  }

function program13(depth0,data,depth1) {
  
  var buffer = "", stack1;
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.show), {hash:{},inverse:self.noop,fn:self.programWithDepth(14, program14, data, depth0, depth1),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program14(depth0,data,depth1,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <tr class=\"row\" data-line-number=\"";
  if (helper = helpers.lineNumber) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.lineNumber); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" id=\""
    + escapeExpression(((stack1 = (depth2 && depth2.uid)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "-";
  if (helper = helpers.lineNumber) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.lineNumber); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.settings)),stack1 == null || stack1 === false ? stack1 : stack1.scm), {hash:{},inverse:self.noop,fn:self.programWithDepth(15, program15, data, depth1, depth2),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.settings)),stack1 == null || stack1 === false ? stack1 : stack1.duplications), {hash:{},inverse:self.noop,fn:self.program(21, program21, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.settings)),stack1 == null || stack1 === false ? stack1 : stack1.coverage), {hash:{},inverse:self.noop,fn:self.program(25, program25, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n          <td class=\"stat lid js-line-actions\" title=\""
    + escapeExpression((helper = helpers.t || (depth2 && depth2.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.line_actions", options) : helperMissing.call(depth0, "t", "component_viewer.line_actions", options)))
    + "\">";
  if (helper = helpers.lineNumber) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.lineNumber); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</td>\n\n          <td class=\"line\"><pre>";
  if (helper = helpers.code) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.code); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</pre></td>\n        </tr>\n      ";
  return buffer;
  }
function program15(depth0,data,depth2,depth3) {
  
  var buffer = "", stack1;
  buffer += "\n            <td class=\"stat ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.scm), {hash:{},inverse:self.noop,fn:self.program(16, program16, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n              ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.scm), {hash:{},inverse:self.noop,fn:self.programWithDepth(18, program18, data, depth2, depth3),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            </td>\n          ";
  return buffer;
  }
function program16(depth0,data) {
  
  
  return "scm";
  }

function program18(depth0,data,depth3,depth4) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n                ";
  stack1 = (helper = helpers.ifSCMChanged || (depth4 && depth4.ifSCMChanged),options={hash:{},inverse:self.noop,fn:self.program(19, program19, data),data:data},helper ? helper.call(depth0, (depth4 && depth4.source), (depth3 && depth3.lineNumber), options) : helperMissing.call(depth0, "ifSCMChanged", (depth4 && depth4.source), (depth3 && depth3.lineNumber), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n              ";
  return buffer;
  }
function program19(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n                  <span class=\"scm-date\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.scm)),stack1 == null || stack1 === false ? stack1 : stack1.date)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</span>\n                  <span class=\"scm-author\" title=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.scm)),stack1 == null || stack1 === false ? stack1 : stack1.author)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.scm)),stack1 == null || stack1 === false ? stack1 : stack1.author)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</span>\n                ";
  return buffer;
  }

function program21(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n            <td class=\"stat duplications\">\n              ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.duplications), {hash:{},inverse:self.noop,fn:self.program(22, program22, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            </td>\n          ";
  return buffer;
  }
function program22(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n                <span class=\"duplication ";
  stack1 = helpers['if'].call(depth0, depth0, {hash:{},inverse:self.noop,fn:self.program(23, program23, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\" data-index=\""
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "\"></span>\n              ";
  return buffer;
  }
function program23(depth0,data) {
  
  
  return "duplication-exists";
  }

function program25(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n            <td class=\"stat ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.coverage), {hash:{},inverse:self.noop,fn:self.program(26, program26, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n              ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.coverage), {hash:{},inverse:self.noop,fn:self.program(31, program31, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            </td>\n\n            <td class=\"stat ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.coverage), {hash:{},inverse:self.noop,fn:self.program(33, program33, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n              ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.coverage), {hash:{},inverse:self.noop,fn:self.program(36, program36, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            </td>\n          ";
  return buffer;
  }
function program26(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "coverage-";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.covered), {hash:{},inverse:self.program(29, program29, data),fn:self.program(27, program27, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  return buffer;
  }
function program27(depth0,data) {
  
  
  return "green";
  }

function program29(depth0,data) {
  
  
  return "red";
  }

function program31(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n                <span class=\"coverage-tests\" title=\""
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "coverage_viewer.line_covered_by_x_tests", ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.testCases), options) : helperMissing.call(depth0, "tp", "coverage_viewer.line_covered_by_x_tests", ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.testCases), options)))
    + "\">\n                  "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.testCases)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n                </span>\n              ";
  return buffer;
  }

function program33(depth0,data) {
  
  var stack1;
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.branchCoverageStatus), {hash:{},inverse:self.noop,fn:self.program(34, program34, data),data:data});
  if(stack1 || stack1 === 0) { return stack1; }
  else { return ''; }
  }
function program34(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "coverage-"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.branchCoverageStatus)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  return buffer;
  }

function program36(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n                ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.branches), {hash:{},inverse:self.noop,fn:self.program(37, program37, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n              ";
  return buffer;
  }
function program37(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n                  <span class=\"coverage-branches\" title=\""
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "coverage_viewer.x_covered_conditions", ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.coveredBranches), options) : helperMissing.call(depth0, "tp", "coverage_viewer.x_covered_conditions", ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.coveredBranches), options)))
    + "\">\n                    "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.coveredBranches)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "/"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.coverage)),stack1 == null || stack1 === false ? stack1 : stack1.branches)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\n                  </span>\n                ";
  return buffer;
  }

  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.sourceSecurity), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-time-changes-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data,depth1) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <li><a class=\"link-action\" data-period=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.key), {hash:{},inverse:self.noop,fn:self.programWithDepth(2, program2, data, depth1),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += " ";
  if (helper = helpers.label) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.label); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</a></li>\n  ";
  return buffer;
  }
function program2(depth0,data,depth2) {
  
  var stack1;
  return escapeExpression(((stack1 = (depth2 && depth2.prefix)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  }

  buffer += "<div class=\"bubble-popup-title\">Time Changes</div>\n\n<ul class=\"bubble-popup-list\">\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.periods), {hash:{},inverse:self.noop,fn:self.programWithDepth(1, program1, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</ul>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-workspace"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.workspace.hide_workspace", options) : helperMissing.call(depth0, "t", "component_viewer.workspace.hide_workspace", options)));
  }

function program3(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.workspace.show_workspace", options) : helperMissing.call(depth0, "t", "component_viewer.workspace.show_workspace", options)));
  }

function program5(depth0,data) {
  
  
  return "\n      <i class=\"icon-double-chevron-left\"></i>\n    ";
  }

function program7(depth0,data) {
  
  
  return "\n      <i class=\"icon-double-chevron-right\"></i>\n    ";
  }

function program9(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <li class=\"component-viewer-workspace-item ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.active), {hash:{},inverse:self.noop,fn:self.program(10, program10, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n      <div class=\"text-ellipsis subtitle\" title=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.projectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n        "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.projectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </div>\n      ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.dir), {hash:{},inverse:self.noop,fn:self.program(14, program14, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      "
    + escapeExpression((helper = helpers.qualifierIcon || (depth0 && depth0.qualifierIcon),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.q), options) : helperMissing.call(depth0, "qualifierIcon", ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.q), options)))
    + " <a class=\"link-action\" data-key=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</a>\n\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.options), {hash:{},inverse:self.noop,fn:self.programWithDepth(16, program16, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </li>\n  ";
  return buffer;
  }
function program10(depth0,data) {
  
  
  return "active";
  }

function program12(depth0,data) {
  
  var buffer = "", stack1;
  buffer += " / "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "<div class=\"text-ellipsis subtitle\">"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.dir)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</div>";
  return buffer;
  }

function program16(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"component-viewer-workspace-transition\">"
    + escapeExpression((helper = helpers.t || (depth1 && depth1.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.transition", (depth1 && depth1.transition), options) : helperMissing.call(depth0, "t", "component_viewer.transition", (depth1 && depth1.transition), options)))
    + "</div>\n        <ul class=\"component-viewer-workspace-options\">\n          ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.options), {hash:{},inverse:self.noop,fn:self.programWithDepth(17, program17, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      ";
  return buffer;
  }
function program17(depth0,data,depth1) {
  
  var buffer = "", stack1, helper;
  buffer += "\n            <li class=\"component-viewer-workspace-option text-ellipsis ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.active), {hash:{},inverse:self.noop,fn:self.program(10, program10, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n              ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.component), {hash:{},inverse:self.noop,fn:self.program(18, program18, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n              ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.subname), {hash:{},inverse:self.noop,fn:self.program(20, program20, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n              <a class=\"link-action\" data-workspace-key=\""
    + escapeExpression(((stack1 = ((stack1 = (depth1 && depth1.component)),stack1 == null || stack1 === false ? stack1 : stack1.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\" data-key=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</a>\n            </li>\n          ";
  return buffer;
  }
function program18(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n                <div class=\"text-ellipsis subtitle\" title=\""
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.projectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n                  "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.projectName)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.subProjectName), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n                </div>\n              ";
  return buffer;
  }

function program20(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "<div class=\"text-ellipsis subtitle\" title=\"";
  if (helper = helpers.subname) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.subname); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.subname) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.subname); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</div>";
  return buffer;
  }

  buffer += "<div class=\"component-viewer-workspace-header\">\n  <div class=\"component-viewer-workspace-title\"\n       title=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.workspace.tooltip", options) : helperMissing.call(depth0, "t", "component_viewer.workspace.tooltip", options)))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.workspace", options) : helperMissing.call(depth0, "t", "component_viewer.workspace", options)))
    + "</div>\n  <button class=\"button-clean component-viewer-workspace-toggle js-toggle-workspace\"\n          title=\"";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.workspace), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\">\n    ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.settings)),stack1 == null || stack1 === false ? stack1 : stack1.workspace), {hash:{},inverse:self.program(7, program7, data),fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </button>\n</div>\n\n<ul class=\"component-viewer-workspace-list\">\n  ";
  stack1 = (helper = helpers.eachReverse || (depth0 && depth0.eachReverse),options={hash:{},inverse:self.noop,fn:self.program(9, program9, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.workspace), options) : helperMissing.call(depth0, "eachReverse", (depth0 && depth0.workspace), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</ul>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-basic-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.size", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.size", options)))
    + "\n    </div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.lines), "lines", "js-filter-lines", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.lines), "lines", "js-filter-lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.ncloc_data), {hash:{},inverse:self.program(4, program4, data),fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.generated_lines), "generated_lines", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.generated_lines), "generated_lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.generated_ncloc), "generated_ncloc", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.generated_ncloc), "generated_ncloc", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.complexity", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.complexity", options)))
    + "\n    </div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.complexity), "complexity", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.complexity), "complexity", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.function_complexity), "function_complexity", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.function_complexity), "function_complexity", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.structure", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.structure", options)))
    + "\n    </div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.classes), "classes", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.classes), "classes", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.functions), "functions", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.functions), "functions", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.accessors), "accessors", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.accessors), "accessors", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.statements), "statements", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.statements), "statements", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.documentation", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.documentation", options)))
    + "\n    </div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.comment_lines), "comment_lines", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.comment_lines), "comment_lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.comment_lines_density), "comment_lines_density", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.comment_lines_density), "comment_lines_density", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.public_api), "public_api", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.public_api), "public_api", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.public_undocumented_api), "public_undocumented_api", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.public_undocumented_api), "public_undocumented_api", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.public_documented_api_density), "public_documented_api_density", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.public_documented_api_density), "public_documented_api_density", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.ncloc), "ncloc", "js-filter-ncloc", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.ncloc), "ncloc", "js-filter-ncloc", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.ncloc), "ncloc", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.ncloc), "ncloc", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }

  stack1 = helpers['with'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-coverage-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  <div class=\"component-viewer-header-time-changes\">\n    <a class=\"js-coverage-time-changes\">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.period), {hash:{},inverse:self.program(4, program4, data),fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </a>\n  </div>\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "Δ "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.period)),stack1 == null || stack1 === false ? stack1 : stack1.label)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<i class=\"icon-period\"></i> "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.time_changes", options) : helperMissing.call(depth0, "t", "component_viewer.time_changes", options)));
  return buffer;
  }

function program6(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.program(9, program9, data),fn:self.program(7, program7, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), (depth0 && depth0.branch_coverage), (depth0 && depth0.conditions_to_cover), (depth0 && depth0.covered_conditions), (depth0 && depth0.uncovered_conditions), (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), (depth0 && depth0.it_branch_coverage), (depth0 && depth0.it_conditions_to_cover), (depth0 && depth0.it_covered_conditions), (depth0 && depth0.it_uncovered_conditions), (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), (depth0 && depth0.overall_branch_coverage), (depth0 && depth0.overall_conditions_to_cover), (depth0 && depth0.overall_covered_conditions), (depth0 && depth0.overall_uncovered_conditions), options) : helperMissing.call(depth0, "any", (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), (depth0 && depth0.branch_coverage), (depth0 && depth0.conditions_to_cover), (depth0 && depth0.covered_conditions), (depth0 && depth0.uncovered_conditions), (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), (depth0 && depth0.it_branch_coverage), (depth0 && depth0.it_conditions_to_cover), (depth0 && depth0.it_covered_conditions), (depth0 && depth0.it_uncovered_conditions), (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), (depth0 && depth0.overall_branch_coverage), (depth0 && depth0.overall_conditions_to_cover), (depth0 && depth0.overall_covered_conditions), (depth0 && depth0.overall_uncovered_conditions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n  <span class=\"nowrap\">\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.programWithDepth(11, program11, data, depth1),data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.programWithDepth(16, program16, data, depth1),data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_branch_coverage), (depth0 && depth0.overall_conditions_to_cover), (depth0 && depth0.overall_covered_conditions), (depth0 && depth0.overall_uncovered_conditions), options) : helperMissing.call(depth0, "any", (depth0 && depth0.overall_branch_coverage), (depth0 && depth0.overall_conditions_to_cover), (depth0 && depth0.overall_covered_conditions), (depth0 && depth0.overall_uncovered_conditions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </span>\n\n  <span class=\"nowrap\">\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.programWithDepth(27, program27, data, depth1),data:data},helper ? helper.call(depth0, (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.programWithDepth(32, program32, data, depth1),data:data},helper ? helper.call(depth0, (depth0 && depth0.branch_coverage), (depth0 && depth0.conditions_to_cover), (depth0 && depth0.covered_conditions), (depth0 && depth0.uncovered_conditions), options) : helperMissing.call(depth0, "any", (depth0 && depth0.branch_coverage), (depth0 && depth0.conditions_to_cover), (depth0 && depth0.covered_conditions), (depth0 && depth0.uncovered_conditions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </span>\n\n  <span class=\"nowrap\">\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.programWithDepth(39, program39, data, depth1),data:data},helper ? helper.call(depth0, (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.programWithDepth(44, program44, data, depth1),data:data},helper ? helper.call(depth0, (depth0 && depth0.it_branch_coverage), (depth0 && depth0.it_conditions_to_cover), (depth0 && depth0.it_covered_conditions), (depth0 && depth0.it_uncovered_conditions), options) : helperMissing.call(depth0, "any", (depth0 && depth0.it_branch_coverage), (depth0 && depth0.it_conditions_to_cover), (depth0 && depth0.it_covered_conditions), (depth0 && depth0.it_uncovered_conditions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </span>\n";
  return buffer;
  }
function program7(depth0,data) {
  
  
  return "\n  ";
  }

function program9(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <div class=\"component-viewer-header-expanded-bar-section\">\n      <div class=\"component-viewer-header-expanded-bar-section-title\">\n        "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.no_coverage", options) : helperMissing.call(depth0, "t", "component_viewer.no_coverage", options)))
    + "\n      </div>\n    </div>\n  ";
  return buffer;
  }

function program11(depth0,data,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.overall", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.overall", options)))
    + "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_coverage), "overall_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_coverage), "overall_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_line_coverage), "overall_line_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_line_coverage), "overall_line_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(14, program14, data),fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program12(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_lines_to_cover), "overall_lines_to_cover", "js-filter-lines-to-cover-overall", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.overall_lines_to_cover), "overall_lines_to_cover", "js-filter-lines-to-cover-overall", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_uncovered_lines), "overall_uncovered_lines", "js-filter-uncovered-lines-overall", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.overall_uncovered_lines), "overall_uncovered_lines", "js-filter-uncovered-lines-overall", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_lines_to_cover), "overall_lines_to_cover", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_lines_to_cover), "overall_lines_to_cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_uncovered_lines), "overall_uncovered_lines", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_uncovered_lines), "overall_uncovered_lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program16(depth0,data,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.program(19, program19, data),fn:self.program(17, program17, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.program(21, program21, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.overall_coverage), (depth0 && depth0.overall_line_coverage), (depth0 && depth0.overall_lines_to_cover), (depth0 && depth0.overall_covered_lines), (depth0 && depth0.overall_uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_branch_coverage), "overall_branch_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_branch_coverage), "overall_branch_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(25, program25, data),fn:self.program(23, program23, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program17(depth0,data) {
  
  
  return "\n            &nbsp;\n          ";
  }

function program19(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.overall", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.overall", options)))
    + "\n          ";
  return buffer;
  }

function program21(depth0,data) {
  
  
  return "\n            <li><span class=\"item\">&nbsp;</span></li>\n          ";
  }

function program23(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_conditions_to_cover), "overall_conditions_to_cover", "js-filter-branches-to-cover-overall", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.overall_conditions_to_cover), "overall_conditions_to_cover", "js-filter-branches-to-cover-overall", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_uncovered_conditions), "overall_uncovered_conditions", "js-filter-uncovered-branches-overall", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.overall_uncovered_conditions), "overall_uncovered_conditions", "js-filter-uncovered-branches-overall", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program25(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_conditions_to_cover), "overall_conditions_to_cover", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_conditions_to_cover), "overall_conditions_to_cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.overall_uncovered_conditions), "overall_uncovered_conditions", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.overall_uncovered_conditions), "overall_uncovered_conditions", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program27(depth0,data,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.unit_tests", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.unit_tests", options)))
    + "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.coverage), "coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.coverage), "coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.line_coverage), "line_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.line_coverage), "line_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(30, program30, data),fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program28(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.lines_to_cover), "lines_to_cover", "js-filter-lines-to-cover", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.lines_to_cover), "lines_to_cover", "js-filter-lines-to-cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.uncovered_lines), "uncovered_lines", "js-filter-uncovered-lines", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.uncovered_lines), "uncovered_lines", "js-filter-uncovered-lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program30(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.lines_to_cover), "lines_to_cover", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.lines_to_cover), "lines_to_cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.uncovered_lines), "uncovered_lines", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.uncovered_lines), "uncovered_lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program32(depth0,data,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.program(33, program33, data),fn:self.program(17, program17, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.program(21, program21, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.coverage), (depth0 && depth0.line_coverage), (depth0 && depth0.lines_to_cover), (depth0 && depth0.covered_lines), (depth0 && depth0.uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.branch_coverage), "branch_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.branch_coverage), "branch_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(37, program37, data),fn:self.program(35, program35, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program33(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.unit_tests", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.unit_tests", options)))
    + "\n          ";
  return buffer;
  }

function program35(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.conditions_to_cover), "conditions_to_cover", "js-filter-branches-to-cover", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.conditions_to_cover), "conditions_to_cover", "js-filter-branches-to-cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.uncovered_conditions), "uncovered_conditions", "js-filter-uncovered-branches", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.uncovered_conditions), "uncovered_conditions", "js-filter-uncovered-branches", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program37(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.conditions_to_cover), "conditions_to_cover", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.conditions_to_cover), "conditions_to_cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.uncovered_conditions), "uncovered_conditions", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.uncovered_conditions), "uncovered_conditions", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program39(depth0,data,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.integration_tests", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.integration_tests", options)))
    + "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_coverage), "it_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_coverage), "it_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_line_coverage), "it_line_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_line_coverage), "it_line_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(42, program42, data),fn:self.program(40, program40, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program40(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_lines_to_cover), "it_lines_to_cover", "js-filter-lines-to-cover-it", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.it_lines_to_cover), "it_lines_to_cover", "js-filter-lines-to-cover-it", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_uncovered_lines), "it_uncovered_lines", "js-filter-uncovered-lines-it", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.it_uncovered_lines), "it_uncovered_lines", "js-filter-uncovered-lines-it", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program42(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_lines_to_cover), "it_lines_to_cover", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_lines_to_cover), "it_lines_to_cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_uncovered_lines), "it_uncovered_lines", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_uncovered_lines), "it_uncovered_lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program44(depth0,data,depth2) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.program(45, program45, data),fn:self.program(17, program17, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.program(47, program47, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), options) : helperMissing.call(depth0, "any", (depth0 && depth0.it_coverage), (depth0 && depth0.it_line_coverage), (depth0 && depth0.it_lines_to_cover), (depth0 && depth0.it_covered_lines), (depth0 && depth0.it_uncovered_lines), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_branch_coverage), "it_branch_coverage", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_branch_coverage), "it_branch_coverage", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(51, program51, data),fn:self.program(49, program49, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program45(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.integration_tests", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.integration_tests", options)))
    + "\n          ";
  return buffer;
  }

function program47(depth0,data) {
  
  
  return "\n              <li><span class=\"item\">&nbsp;</span></li>\n          ";
  }

function program49(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_conditions_to_cover), "it_conditions_to_cover", "js-filter-branches-to-cover-it", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.it_conditions_to_cover), "it_conditions_to_cover", "js-filter-branches-to-cover-it", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_uncovered_conditions), "it_uncovered_conditions", "js-filter-uncovered-branches-it", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.it_uncovered_conditions), "it_uncovered_conditions", "js-filter-uncovered-branches-it", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

function program51(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_conditions_to_cover), "it_conditions_to_cover", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_conditions_to_cover), "it_conditions_to_cover", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.it_uncovered_conditions), "it_uncovered_conditions", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.it_uncovered_conditions), "it_uncovered_conditions", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  return buffer;
  }

  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n";
  stack1 = helpers['with'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures), {hash:{},inverse:self.noop,fn:self.programWithDepth(6, program6, data, depth0),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-covered-files-popup"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.status), "FAILURE", options) : helperMissing.call(depth0, "notEq", ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.status), "FAILURE", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  ";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"bubble-popup-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.transition.covers", options) : helperMissing.call(depth0, "t", "component_viewer.transition.covers", options)))
    + "</div>\n      ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.items), {hash:{},inverse:self.program(5, program5, data),fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program3(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <div class=\"bubble-popup-section\">\n          <a class=\"component-viewer-popup-test-file link-action\" data-key=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</a>\n          <span class=\"subtitle\">"
    + escapeExpression((helper = helpers.tp || (depth0 && depth0.tp),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.x_lines_are_covered", (depth0 && depth0.coveredLines), options) : helperMissing.call(depth0, "tp", "component_viewer.x_lines_are_covered", (depth0 && depth0.coveredLines), options)))
    + "</span>\n          <br><span class=\"subtitle\" title=\"";
  if (helper = helpers.dir) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.dir); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.dir) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.dir); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n        </div>\n      ";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "none", options) : helperMissing.call(depth0, "t", "none", options)))
    + "\n      ";
  return buffer;
  }

function program7(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <div class=\"bubble-popup-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.details", options) : helperMissing.call(depth0, "t", "component_viewer.details", options)))
    + "</div>\n    ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.message), {hash:{},inverse:self.noop,fn:self.program(8, program8, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    <pre>"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.stackTrace)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</pre>\n  ";
  return buffer;
  }
function program8(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      <pre>"
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.message)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "</pre>\n    ";
  return buffer;
  }

  buffer += "<div class=\"bubble-popup-container\">\n  ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.status), "ERROR", options) : helperMissing.call(depth0, "notEq", ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.status), "ERROR", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n  ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(7, program7, data),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.status), "OK", options) : helperMissing.call(depth0, "notEq", ((stack1 = (depth0 && depth0.test)),stack1 == null || stack1 === false ? stack1 : stack1.status), "OK", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n</div>\n\n<div class=\"bubble-popup-arrow\"></div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-duplications-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var stack1, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "duplications", options) : helperMissing.call(depth0, "t", "duplications", options)))
    + "</div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth1 && depth1.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.program(4, program4, data),fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.duplicated_lines), "duplicated_lines", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.duplicated_lines), "duplicated_lines", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        ";
  stack1 = (helper = helpers.componentViewerHeaderLink || (depth0 && depth0.componentViewerHeaderLink),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.duplicated_blocks), "duplicated_blocks", "js-filter-duplications", options) : helperMissing.call(depth0, "componentViewerHeaderLink", (depth0 && depth0.duplicated_blocks), "duplicated_blocks", "js-filter-duplications", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        ";
  stack1 = (helper = helpers.componentViewerHeaderItem || (depth0 && depth0.componentViewerHeaderItem),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.duplicated_blocks), "duplicated_blocks", options) : helperMissing.call(depth0, "componentViewerHeaderItem", (depth0 && depth0.duplicated_blocks), "duplicated_blocks", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }

  stack1 = helpers['with'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures), {hash:{},inverse:self.noop,fn:self.programWithDepth(1, program1, data, depth0),data:data});
  if(stack1 || stack1 === 0) { return stack1; }
  else { return ''; }
  });

this["SS"]["Templates"]["cw-issues-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  <div class=\"component-viewer-header-time-changes\">\n    <a class=\"link-action js-issues-time-changes\">\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.period), {hash:{},inverse:self.program(4, program4, data),fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </a>\n  </div>\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.added", options) : helperMissing.call(depth0, "t", "component_viewer.added", options)))
    + " "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.period)),stack1 == null || stack1 === false ? stack1 : stack1.label)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<i class=\"icon-period\"></i> "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.time_changes", options) : helperMissing.call(depth0, "t", "component_viewer.time_changes", options)));
  return buffer;
  }

function program6(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.filters", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.filters", options)));
  }

function program8(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.no_issues", options) : helperMissing.call(depth0, "t", "component_viewer.no_issues", options)));
  }

function program10(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <li><a class=\"item js-filter-current-issue\">\n        <span>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.issues.current_issue", options) : helperMissing.call(depth0, "t", "component_viewer.issues.current_issue", options)))
    + "</span>\n        <i class=\"icon-component-viewer-filter\"></i>\n      </a></li>\n    ";
  return buffer;
  }

function program12(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <li><a class=\"item js-filter-unresolved-issues\">\n        <span>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.issues.unresolved_issues", options) : helperMissing.call(depth0, "t", "component_viewer.issues.unresolved_issues", options)))
    + "</span>\n        <i class=\"icon-component-viewer-filter\"></i>\n      </a></li>\n    ";
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <li><a class=\"item js-filter-open-issues\">\n        <span>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.issues.open_issues", options) : helperMissing.call(depth0, "t", "component_viewer.issues.open_issues", options)))
    + "</span>\n        <i class=\"icon-component-viewer-filter\"></i>\n      </a></li>\n    ";
  return buffer;
  }

function program16(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <li><a class=\"item js-filter-fixed-issues\">\n        <span>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.issues.fixed_issues", options) : helperMissing.call(depth0, "t", "component_viewer.issues.fixed_issues", options)))
    + "</span>\n        <i class=\"icon-component-viewer-filter\"></i>\n      </a></li>\n    ";
  return buffer;
  }

function program18(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <li><a class=\"item js-filter-false-positive-issues\">\n        <span>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.issues.false_positive_issues", options) : helperMissing.call(depth0, "t", "component_viewer.issues.false_positive_issues", options)))
    + "</span>\n        <i class=\"icon-component-viewer-filter\"></i>\n      </a></li>\n    ";
  return buffer;
  }

function program20(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.severities", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.severities", options)))
    + "\n    </div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = helpers.each.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.severities), {hash:{},inverse:self.noop,fn:self.programWithDepth(21, program21, data, depth1),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n";
  return buffer;
  }
function program21(depth0,data,depth2) {
  
  var buffer = "", stack1;
  buffer += "\n        ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.program(24, program24, data),fn:self.program(22, program22, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }
function program22(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <li><a class=\"item js-filter-";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "-issues\">\n            <span>"
    + escapeExpression((helper = helpers.severityIcon || (depth0 && depth0.severityIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.key), options) : helperMissing.call(depth0, "severityIcon", (depth0 && depth0.key), options)))
    + " ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <span class=\"number\">";
  if (helper = helpers.count) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.count); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <i class=\"icon-component-viewer-filter\"></i>\n          </a></li>\n        ";
  return buffer;
  }

function program24(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <li><span class=\"item\">\n            <span>"
    + escapeExpression((helper = helpers.severityIcon || (depth0 && depth0.severityIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.key), options) : helperMissing.call(depth0, "severityIcon", (depth0 && depth0.key), options)))
    + " ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <span class=\"number\">";
  if (helper = helpers.count) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.count); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          </span></li>\n        ";
  return buffer;
  }

function program26(depth0,data,depth1) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <div class=\"component-viewer-header-expanded-bar-section\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.rules", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.rules", options)))
    + "\n    </div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = helpers.each.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.rules), {hash:{},inverse:self.noop,fn:self.programWithDepth(27, program27, data, depth1),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n";
  return buffer;
  }
function program27(depth0,data,depth2) {
  
  var buffer = "", stack1;
  buffer += "\n        ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth2 && depth2.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.program(30, program30, data),fn:self.program(28, program28, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }
function program28(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n          <li><a class=\"item js-filter-rule\" data-rule=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n            <span>";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <span class=\"number\">";
  if (helper = helpers.count) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.count); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <i class=\"icon-component-viewer-filter\"></i>\n          </a></li>\n        ";
  return buffer;
  }

function program30(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n          <li><span class=\"item\">\n            <span>";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            <span class=\"number\">";
  if (helper = helpers.count) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.count); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          </span></li>\n        ";
  return buffer;
  }

function program32(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n  <div class=\"component-viewer-header-expanded-bar-section component-viewer-header-expanded-bar-section-actions\">\n    <div class=\"component-viewer-header-expanded-bar-section-title\">&nbsp;</div>\n    <ul class=\"component-viewer-header-expanded-bar-section-list\">\n      ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.canBulkChange), {hash:{},inverse:self.noop,fn:self.program(33, program33, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </ul>\n  </div>\n";
  return buffer;
  }
function program33(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        <li><a class=\"link-action js-issues-bulk-change\" title=\"200 max\">\n          <span><i class=\"icon-bulk-change\"></i> "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "bulk_change", options) : helperMissing.call(depth0, "t", "bulk_change", options)))
    + "</span>\n        </a></li>\n      ";
  return buffer;
  }

  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.hasSource), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n<div class=\"component-viewer-header-expanded-bar-section\">\n  <div class=\"component-viewer-header-expanded-bar-section-title\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.hasIssues), {hash:{},inverse:self.program(8, program8, data),fn:self.program(6, program6, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n  <ul class=\"component-viewer-header-expanded-bar-section-list\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.currentIssue), {hash:{},inverse:self.noop,fn:self.program(10, program10, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.noop,fn:self.program(14, program14, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.noop,fn:self.program(16, program16, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers.unless.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.removed), {hash:{},inverse:self.noop,fn:self.program(18, program18, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </ul>\n</div>\n\n";
  stack1 = (helper = helpers.ifNotEmpty || (depth0 && depth0.ifNotEmpty),options={hash:{},inverse:self.noop,fn:self.programWithDepth(20, program20, data, depth0),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.severities), options) : helperMissing.call(depth0, "ifNotEmpty", ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.severities), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n";
  stack1 = (helper = helpers.ifNotEmpty || (depth0 && depth0.ifNotEmpty),options={hash:{},inverse:self.noop,fn:self.programWithDepth(26, program26, data, depth0),data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.rules), options) : helperMissing.call(depth0, "ifNotEmpty", ((stack1 = (depth0 && depth0.state)),stack1 == null || stack1 === false ? stack1 : stack1.rules), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.hasIssues), {hash:{},inverse:self.noop,fn:self.program(32, program32, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-scm-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "Δ "
    + escapeExpression(((stack1 = ((stack1 = (depth0 && depth0.period)),stack1 == null || stack1 === false ? stack1 : stack1.label)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1));
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "<i class=\"icon-period\"></i> "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.time_changes", options) : helperMissing.call(depth0, "t", "component_viewer.time_changes", options)));
  return buffer;
  }

  buffer += "<div class=\"component-viewer-header-time-changes\">\n  <a class=\"js-scm-time-changes\">\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.period), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </a>\n</div>\n\n<div class=\"component-viewer-header-expanded-bar-section\">\n  <ul class=\"component-viewer-header-expanded-bar-section-list\">\n    <li><a class=\"item js-filter-modified-lines\">\n      <span>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.scm.modified_lines", options) : helperMissing.call(depth0, "t", "component_viewer.scm.modified_lines", options)))
    + "</span>\n      <i class=\"icon-component-viewer-filter\"></i>\n    </a></li>\n  </ul>\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["cw-tests-header"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <span class=\"nowrap\">\n    ";
  stack1 = (helper = helpers.any || (depth0 && depth0.any),options={hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.test_success_density), (depth0 && depth0.test_failures), (depth0 && depth0.test_errors), (depth0 && depth0.test_execution_time), options) : helperMissing.call(depth0, "any", (depth0 && depth0.test_success_density), (depth0 && depth0.test_failures), (depth0 && depth0.test_errors), (depth0 && depth0.test_execution_time), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </span>\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"component-viewer-header-expanded-bar-section\">\n        <div class=\"component-viewer-header-expanded-bar-section-title\">\n          "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.tests", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.tests", options)))
    + "\n        </div>\n        <ul class=\"component-viewer-header-expanded-bar-section-list\">\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.test_success_density), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.skipped_tests), {hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.test_failures), {hash:{},inverse:self.noop,fn:self.program(7, program7, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.test_errors), {hash:{},inverse:self.noop,fn:self.program(9, program9, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.test_execution_time), {hash:{},inverse:self.noop,fn:self.program(11, program11, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </ul>\n      </div>\n    ";
  return buffer;
  }
function program3(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <li><span class=\"item\" data-metric=\"test_success_density\">\n              <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.test_success_density.short_name", options) : helperMissing.call(depth0, "t", "metric.test_success_density.short_name", options)))
    + "</span>\n              <span class=\"number\">";
  if (helper = helpers.test_success_density) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.test_success_density); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            </span></li>\n          ";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <li><span class=\"item\" data-metric=\"skipped_tests\">\n              <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.skipped_tests.short_name", options) : helperMissing.call(depth0, "t", "metric.skipped_tests.short_name", options)))
    + "</span>\n              <span class=\"number\">";
  if (helper = helpers.skipped_tests) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.skipped_tests); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            </span></li>\n          ";
  return buffer;
  }

function program7(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <li><span class=\"item\" data-metric=\"test_failures\">\n              <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.test_failures.short_name", options) : helperMissing.call(depth0, "t", "metric.test_failures.short_name", options)))
    + "</span>\n              <span class=\"number\">";
  if (helper = helpers.test_failures) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.test_failures); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            </span></li>\n          ";
  return buffer;
  }

function program9(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <li><span class=\"item\" data-metric=\"test_errors\">\n              <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.test_errors.short_name", options) : helperMissing.call(depth0, "t", "metric.test_errors.short_name", options)))
    + "</span>\n              <span class=\"number\">";
  if (helper = helpers.test_errors) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.test_errors); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            </span></li>\n          ";
  return buffer;
  }

function program11(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n            <li><span class=\"item\" data-metric=\"test_execution_time\">\n              <span class=\"label\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "metric.test_execution_time.short_name", options) : helperMissing.call(depth0, "t", "metric.test_execution_time.short_name", options)))
    + "</span>\n              <span class=\"number\">";
  if (helper = helpers.test_execution_time) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.test_execution_time); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            </span></li>\n          ";
  return buffer;
  }

function program13(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <span class=\"ib\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.covered_lines", options) : helperMissing.call(depth0, "t", "component_viewer.covered_lines", options)))
    + "</span>\n    ";
  return buffer;
  }

function program15(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      ";
  stack1 = (helper = helpers.eq || (depth0 && depth0.eq),options={hash:{},inverse:self.program(18, program18, data),fn:self.program(16, program16, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.status), "SKIPPED", options) : helperMissing.call(depth0, "eq", (depth0 && depth0.status), "SKIPPED", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program16(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <li><span class=\"item\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-status=\"";
  if (helper = helpers.status) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.status); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n        <span class=\"label\">"
    + escapeExpression((helper = helpers.testStatusIcon || (depth0 && depth0.testStatusIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.status), options) : helperMissing.call(depth0, "testStatusIcon", (depth0 && depth0.status), options)))
    + "\n          <span class=\"duration subtitle\"></span>\n          ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n        </span></li>\n      ";
  return buffer;
  }

function program18(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        ";
  stack1 = (helper = helpers.ifTestData || (depth0 && depth0.ifTestData),options={hash:{},inverse:self.program(22, program22, data),fn:self.program(19, program19, data),data:data},helper ? helper.call(depth0, depth0, options) : helperMissing.call(depth0, "ifTestData", depth0, options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }
function program19(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <li><a class=\"item js-unit-test\" data-name=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-status=\"";
  if (helper = helpers.status) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.status); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n          <span class=\"label\">"
    + escapeExpression((helper = helpers.testStatusIcon || (depth0 && depth0.testStatusIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.status), options) : helperMissing.call(depth0, "testStatusIcon", (depth0 && depth0.status), options)))
    + "\n            <span class=\"duration subtitle\">";
  if (helper = helpers.durationInMs) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.durationInMs); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "ms</span>\n            ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.coveredLines), {hash:{},inverse:self.noop,fn:self.program(20, program20, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            <i class=\"icon-component-viewer-filter\"></i>\n          </a></li>\n        ";
  return buffer;
  }
function program20(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n              <span class=\"number\">";
  if (helper = helpers.coveredLines) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.coveredLines); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n            ";
  return buffer;
  }

function program22(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <li><span class=\"item\" data-name=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-status=\"";
  if (helper = helpers.status) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.status); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" title=\"";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n          <span class=\"label\">"
    + escapeExpression((helper = helpers.testStatusIcon || (depth0 && depth0.testStatusIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.status), options) : helperMissing.call(depth0, "testStatusIcon", (depth0 && depth0.status), options)))
    + "\n            <span class=\"duration subtitle\">";
  if (helper = helpers.durationInMs) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.durationInMs); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "ms</span> ";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          </span></li>\n        ";
  return buffer;
  }

  stack1 = helpers['with'].call(depth0, ((stack1 = (depth0 && depth0.component)),stack1 == null || stack1 === false ? stack1 : stack1.measures), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n<div class=\"component-viewer-header-expanded-bar-section large\">\n  <div class=\"component-viewer-header-expanded-bar-section-title justify\">\n    <span class=\"ib\">\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.measure_section.test_cases", options) : helperMissing.call(depth0, "t", "component_viewer.measure_section.test_cases", options)))
    + "\n      "
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.tests.ordered_by", options) : helperMissing.call(depth0, "t", "component_viewer.tests.ordered_by", options)))
    + "\n      <a class=\"js-sort-tests-name\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.tests.test_name", options) : helperMissing.call(depth0, "t", "component_viewer.tests.test_name", options)))
    + "</a>\n      /\n      <a class=\"js-sort-tests-duration\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "component_viewer.tests.duration", options) : helperMissing.call(depth0, "t", "component_viewer.tests.duration", options)))
    + "</a>\n    </span>\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.hasCoveragePerTestData), {hash:{},inverse:self.noop,fn:self.program(13, program13, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n  <ul class=\"component-viewer-header-expanded-bar-section-list\">\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.tests), {hash:{},inverse:self.noop,fn:self.program(15, program15, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </ul>\n</div>\n";
  return buffer;
  });

return this["SS"]["Templates"];

});
(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/models/state',['backbone'], function(Backbone) {
    var State;
    return State = (function(_super) {
      __extends(State, _super);

      function State() {
        return State.__super__.constructor.apply(this, arguments);
      }

      State.prototype.defaults = {
        hasMeasures: false,
        hasIssues: false,
        hasCoverage: false,
        hasITCoverage: false,
        hasDuplications: false,
        hasTests: false,
        hasSCM: false,
        activeHeaderTab: null
      };

      return State;

    })(Backbone.Model);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/models/component',['backbone'], function(Backbone) {
    var Component;
    return Component = (function(_super) {
      __extends(Component, _super);

      function Component() {
        return Component.__super__.constructor.apply(this, arguments);
      }

      return Component;

    })(Backbone.Model);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/models/period',['backbone'], function(Backbone) {
    var Period;
    return Period = (function(_super) {
      __extends(Period, _super);

      function Period() {
        return Period.__super__.constructor.apply(this, arguments);
      }

      Period.prototype.defaults = {
        key: '',
        sinceDate: null
      };

      return Period;

    })(Backbone.Model);
  });

}).call(this);

(function() {
  var __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/utils',[],function() {
    return {
      splitLongName: function(longName) {
        var lastSeparator;
        lastSeparator = longName.lastIndexOf('/');
        if (lastSeparator === -1) {
          lastSeparator = longName.lastIndexOf('.');
        }
        return {
          dir: longName.substr(0, lastSeparator),
          name: longName.substr(lastSeparator + 1)
        };
      },
      sortSeverities: function(severities) {
        var order;
        order = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
        return _.sortBy(severities, function(s) {
          return order.indexOf(s.key);
        });
      },
      mixOf: function() {
        var Mixed, base, method, mixin, mixins, name, _i, _ref;
        base = arguments[0], mixins = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        Mixed = (function(_super) {
          __extends(Mixed, _super);

          function Mixed() {
            return Mixed.__super__.constructor.apply(this, arguments);
          }

          return Mixed;

        })(base);
        for (_i = mixins.length - 1; _i >= 0; _i += -1) {
          mixin = mixins[_i];
          _ref = mixin.prototype;
          for (name in _ref) {
            method = _ref[name];
            Mixed.prototype[name] = method;
          }
        }
        return Mixed;
      }
    };
  });

}).call(this);

(function() {
  define('component-viewer/mixins/main-issues',['component-viewer/utils'], function(utils) {
    var $, API_COMPONENT, API_ISSUES, IssuesMixin, LINES_AROUND_ISSUE;
    $ = jQuery;
    API_COMPONENT = "" + baseUrl + "/api/components/app";
    API_ISSUES = "" + baseUrl + "/api/issues/search";
    LINES_AROUND_ISSUE = 4;
    return IssuesMixin = (function() {
      function IssuesMixin() {}

      IssuesMixin.prototype.requestIssues = function(key) {
        var options;
        options = {
          components: key,
          ps: 10000,
          extra_fields: 'actions,transitions,assigneeName,actionPlanName'
        };
        return $.get(API_ISSUES, options, (function(_this) {
          return function(data) {
            var issues;
            _this.state.set('hasIssues', true);
            issues = _.sortBy(data.issues, function(issue) {
              return "" + issue.rule + "_____" + issue.message;
            });
            _this.source.set({
              issues: issues
            });
            return _this.resetIssues();
          };
        })(this));
      };

      IssuesMixin.prototype.resetIssues = function() {
        var issues;
        issues = this.source.get('issues');
        if (_.isArray(issues)) {
          return this.source.set({
            activeIssues: issues.filter(function(issue) {
              return !issue.resolution;
            })
          });
        }
      };

      IssuesMixin.prototype.showIssues = function(store, issue) {
        if (store == null) {
          store = false;
        }
        this.settings.set('issues', true);
        if (store) {
          this.storeSettings();
        }
        if (issue != null) {
          this.currentIssue = issue.key;
          this.source.set('issues', [issue]);
          this.filterByCurrentIssue();
          this.headerView.render();
          return this.trigger('sized');
        } else {
          if (!this.state.get('hasIssues')) {
            return this.requestIssues(this.key).done((function(_this) {
              return function() {
                _this.sourceView.render();
                return _this.trigger('sized');
              };
            })(this));
          } else {
            this.sourceView.render();
            return this.trigger('sized');
          }
        }
      };

      IssuesMixin.prototype.hideIssues = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('issues', false);
        if (store) {
          this.storeSettings();
        }
        return this.sourceView.render();
      };

      IssuesMixin.prototype.requestIssuesPeriod = function(key, period) {
        var params;
        params = {
          key: key
        };
        if (period != null) {
          params.period = period;
        }
        return $.get(API_COMPONENT, params, (function(_this) {
          return function(data) {
            var rules, severities;
            rules = data.rules.map(function(r) {
              return {
                key: r[0],
                name: r[1],
                count: r[2]
              };
            });
            severities = data.severities.map(function(r) {
              return {
                key: r[0],
                name: r[1],
                count: r[2]
              };
            });
            return _this.state.set({
              rules: _.sortBy(rules, 'name'),
              severities: utils.sortSeverities(severities)
            });
          };
        })(this));
      };

      IssuesMixin.prototype.filterLinesByIssues = function() {
        var issues;
        issues = this.source.get('issues');
        this.sourceView.resetShowBlocks();
        issues.forEach((function(_this) {
          return function(issue) {
            var line;
            line = issue.line || 0;
            if (issue.status === 'CLOSED') {
              return _this.sourceView.addShowBlock(0, 0, true);
            } else {
              return _this.sourceView.addShowBlock(line - LINES_AROUND_ISSUE, line + LINES_AROUND_ISSUE, line === 0);
            }
          };
        })(this));
        return this.sourceView.render();
      };

      IssuesMixin.prototype.filterByIssues = function(predicate, requestIssues) {
        var p, period;
        if (requestIssues == null) {
          requestIssues = true;
        }
        period = this.state.get('period');
        if (period) {
          p = predicate;
          predicate = (function(_this) {
            return function(issue) {
              var creationDate;
              creationDate = new Date(moment(issue.creationDate).format());
              return (creationDate > period.get('sinceDate')) && p(issue);
            };
          })(this);
        }
        if (requestIssues && !this.state.get('hasIssues')) {
          return this.requestIssues(this.key).done((function(_this) {
            return function() {
              return _this._filterByIssues(predicate);
            };
          })(this));
        } else {
          return this._filterByIssues(predicate);
        }
      };

      IssuesMixin.prototype._filterByIssues = function(predicate) {
        var activeIssues, issues;
        issues = this.source.get('issues');
        this.settings.set('issues', true);
        this.sourceView.resetShowBlocks();
        activeIssues = [];
        issues.forEach((function(_this) {
          return function(issue) {
            var line;
            if (predicate(issue)) {
              line = issue.line || 0;
              if (issue.status === 'CLOSED') {
                _this.sourceView.addShowBlock(0, 0, true);
              } else {
                _this.sourceView.addShowBlock(line - LINES_AROUND_ISSUE, line + LINES_AROUND_ISSUE, line === 0);
              }
              return activeIssues.push(issue);
            }
          };
        })(this));
        this.source.set('activeIssues', activeIssues);
        return this.sourceView.render();
      };

      IssuesMixin.prototype.filterByCurrentIssue = function() {
        return this.filterByIssues(((function(_this) {
          return function(issue) {
            return issue.key === _this.currentIssue;
          };
        })(this)), false);
      };

      IssuesMixin.prototype.filterByAllIssues = function() {
        return this.filterByIssues(function() {
          return true;
        });
      };

      IssuesMixin.prototype.filterByFixedIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.resolution === 'FIXED';
        });
      };

      IssuesMixin.prototype.filterByUnresolvedIssues = function() {
        return this.filterByIssues(function(issue) {
          return !issue.resolution;
        });
      };

      IssuesMixin.prototype.filterByFalsePositiveIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.resolution === 'FALSE-POSITIVE';
        });
      };

      IssuesMixin.prototype.filterByOpenIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.status === 'OPEN' || issue.status === 'REOPENED';
        });
      };

      IssuesMixin.prototype.filterByRule = function(rule) {
        return this.filterByIssues(function(issue) {
          return issue.rule === rule && !issue.resolution;
        });
      };

      IssuesMixin.prototype.filterByBlockerIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.severity === 'BLOCKER' && !issue.resolution;
        });
      };

      IssuesMixin.prototype.filterByCriticalIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.severity === 'CRITICAL' && !issue.resolution;
        });
      };

      IssuesMixin.prototype.filterByMajorIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.severity === 'MAJOR' && !issue.resolution;
        });
      };

      IssuesMixin.prototype.filterByMinorIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.severity === 'MINOR' && !issue.resolution;
        });
      };

      IssuesMixin.prototype.filterByInfoIssues = function() {
        return this.filterByIssues(function(issue) {
          return issue.severity === 'INFO' && !issue.resolution;
        });
      };

      return IssuesMixin;

    })();
  });

}).call(this);

(function() {
  define('component-viewer/mixins/main-coverage',[], function() {
    var $, API_COVERAGE, CoverageMixin, LINES_AROUND_COVERED_LINE;
    $ = jQuery;
    API_COVERAGE = "" + baseUrl + "/api/coverage/show";
    LINES_AROUND_COVERED_LINE = 1;
    return CoverageMixin = (function() {
      function CoverageMixin() {}

      CoverageMixin.prototype.requestCoverage = function(key, type) {
        if (type == null) {
          type = 'UT';
        }
        return $.get(API_COVERAGE, {
          key: key,
          type: type
        }, (function(_this) {
          return function(data) {
            if ((data != null ? data.coverage : void 0) == null) {
              return;
            }
            _this.state.set('hasCoverage', true);
            _this.source.set({
              coverage: data.coverage
            });
            return _this.augmentWithCoverage(data.coverage);
          };
        })(this));
      };

      CoverageMixin.prototype.augmentWithCoverage = function(coverage) {
        var formattedSource;
        formattedSource = this.source.get('formattedSource');
        coverage.forEach(function(c) {
          var line;
          line = _.findWhere(formattedSource, {
            lineNumber: c[0]
          });
          line.coverage = {
            covered: c[1],
            testCases: c[2],
            branches: c[3],
            coveredBranches: c[4]
          };
          if ((line.coverage.branches != null) && (line.coverage.coveredBranches != null)) {
            if (line.coverage.branches === line.coverage.coveredBranches) {
              line.coverage.branchCoverageStatus = 'green';
            }
            if (line.coverage.branches > line.coverage.coveredBranches) {
              line.coverage.branchCoverageStatus = 'orange';
            }
            if (line.coverage.coveredBranches === 0) {
              return line.coverage.branchCoverageStatus = 'red';
            }
          }
        });
        return this.source.set('formattedSource', formattedSource);
      };

      CoverageMixin.prototype.showCoverage = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('coverage', true);
        if (store) {
          this.storeSettings();
        }
        if (!this.state.get('hasCoverage')) {
          return this.requestCoverage(this.key).done((function(_this) {
            return function() {
              return _this.sourceView.render();
            };
          })(this));
        } else {
          return this.sourceView.render();
        }
      };

      CoverageMixin.prototype.hideCoverage = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('coverage', false);
        if (store) {
          this.storeSettings();
        }
        return this.sourceView.render();
      };

      CoverageMixin.prototype.filterByCoverage = function(predicate) {
        var requests;
        requests = [this.requestCoverage(this.key)];
        if (this.settings.get('issues') && !this.state.get('hasIssues')) {
          requests.push(this.requestIssues(this.key));
        }
        return $.when.apply($, requests).done((function(_this) {
          return function() {
            _this.resetIssues();
            return _this._filterByCoverage(predicate);
          };
        })(this));
      };

      CoverageMixin.prototype.filterByCoverageIT = function(predicate) {
        var requests;
        requests = [this.requestCoverage(this.key, 'IT')];
        if (this.settings.get('issues') && !this.state.get('hasIssues')) {
          requests.push(this.requestIssues(this.key));
        }
        return $.when.apply($, requests).done((function(_this) {
          return function() {
            _this.resetIssues();
            return _this._filterByCoverage(predicate);
          };
        })(this));
      };

      CoverageMixin.prototype.filterByCoverageOverall = function(predicate) {
        var requests;
        requests = [this.requestCoverage(this.key, 'OVERALL')];
        if (this.settings.get('issues') && !this.state.get('hasIssues')) {
          requests.push(this.requestIssues(this.key));
        }
        return $.when.apply($, requests).done((function(_this) {
          return function() {
            _this.resetIssues();
            return _this._filterByCoverage(predicate);
          };
        })(this));
      };

      CoverageMixin.prototype._filterByCoverage = function(predicate) {
        var formattedSource, p, period, periodDate;
        period = this.state.get('period');
        if (period) {
          periodDate = period.get('sinceDate');
          p = predicate;
          predicate = (function(_this) {
            return function(line) {
              var _ref;
              return ((line != null ? (_ref = line.scm) != null ? _ref.date : void 0 : void 0) != null) && (new Date(line.scm.date) >= periodDate) && p(line);
            };
          })(this);
        }
        formattedSource = this.source.get('formattedSource');
        this.settings.set('coverage', true);
        this.sourceView.resetShowBlocks();
        formattedSource.forEach((function(_this) {
          return function(line) {
            var ln;
            if (predicate(line)) {
              ln = line.lineNumber;
              return _this.sourceView.addShowBlock(ln - LINES_AROUND_COVERED_LINE, ln + LINES_AROUND_COVERED_LINE);
            }
          };
        })(this));
        return this.sourceView.render();
      };

      CoverageMixin.prototype.filterByLinesToCover = function() {
        return this.filterByCoverage(function(line) {
          var _ref;
          return (line != null ? (_ref = line.coverage) != null ? _ref.covered : void 0 : void 0) != null;
        });
      };

      CoverageMixin.prototype.filterByUncoveredLines = function() {
        return this.filterByCoverage(function(line) {
          var _ref;
          return ((line != null ? (_ref = line.coverage) != null ? _ref.covered : void 0 : void 0) != null) && !line.coverage.covered;
        });
      };

      CoverageMixin.prototype.filterByBranchesToCover = function() {
        return this.filterByCoverage(function(line) {
          var _ref;
          return (line != null ? (_ref = line.coverage) != null ? _ref.branches : void 0 : void 0) != null;
        });
      };

      CoverageMixin.prototype.filterByUncoveredBranches = function() {
        return this.filterByCoverage(function(line) {
          var _ref;
          return ((line != null ? (_ref = line.coverage) != null ? _ref.branches : void 0 : void 0) != null) && (line.coverage.coveredBranches != null) && line.coverage.branches > line.coverage.coveredBranches;
        });
      };

      CoverageMixin.prototype.filterByLinesToCoverIT = function() {
        return this.filterByCoverageIT(function(line) {
          var _ref;
          return (line != null ? (_ref = line.coverage) != null ? _ref.covered : void 0 : void 0) != null;
        });
      };

      CoverageMixin.prototype.filterByUncoveredLinesIT = function() {
        return this.filterByCoverageIT(function(line) {
          var _ref;
          return ((line != null ? (_ref = line.coverage) != null ? _ref.covered : void 0 : void 0) != null) && !line.coverage.covered;
        });
      };

      CoverageMixin.prototype.filterByBranchesToCoverIT = function() {
        return this.filterByCoverageIT(function(line) {
          var _ref;
          return (line != null ? (_ref = line.coverage) != null ? _ref.branches : void 0 : void 0) != null;
        });
      };

      CoverageMixin.prototype.filterByUncoveredBranchesIT = function() {
        return this.filterByCoverageIT(function(line) {
          var _ref;
          return ((line != null ? (_ref = line.coverage) != null ? _ref.branches : void 0 : void 0) != null) && (line.coverage.coveredBranches != null) && line.coverage.branches > line.coverage.coveredBranches;
        });
      };

      CoverageMixin.prototype.filterByLinesToCoverOverall = function() {
        return this.filterByCoverageOverall(function(line) {
          var _ref;
          return (line != null ? (_ref = line.coverage) != null ? _ref.covered : void 0 : void 0) != null;
        });
      };

      CoverageMixin.prototype.filterByUncoveredLinesOverall = function() {
        return this.filterByCoverageOverall(function(line) {
          var _ref;
          return ((line != null ? (_ref = line.coverage) != null ? _ref.covered : void 0 : void 0) != null) && !line.coverage.covered;
        });
      };

      CoverageMixin.prototype.filterByBranchesToCoverOverall = function() {
        return this.filterByCoverageOverall(function(line) {
          var _ref;
          return (line != null ? (_ref = line.coverage) != null ? _ref.branches : void 0 : void 0) != null;
        });
      };

      CoverageMixin.prototype.filterByUncoveredBranchesOverall = function() {
        return this.filterByCoverageOverall(function(line) {
          var _ref;
          return ((line != null ? (_ref = line.coverage) != null ? _ref.branches : void 0 : void 0) != null) && (line.coverage.coveredBranches != null) && line.coverage.branches > line.coverage.coveredBranches;
        });
      };

      return CoverageMixin;

    })();
  });

}).call(this);

(function() {
  define('component-viewer/mixins/main-duplications',[], function() {
    var $, API_DUPLICATIONS, DuplicationsMixin, LINES_AROUND_DUPLICATION;
    $ = jQuery;
    API_DUPLICATIONS = "" + baseUrl + "/api/duplications/show";
    LINES_AROUND_DUPLICATION = 1;
    return DuplicationsMixin = (function() {
      function DuplicationsMixin() {}

      DuplicationsMixin.prototype.requestDuplications = function(key) {
        return $.get(API_DUPLICATIONS, {
          key: key
        }, (function(_this) {
          return function(data) {
            if ((data != null ? data.duplications : void 0) == null) {
              return;
            }
            _this.state.set('hasDuplications', true);
            _this.source.set({
              duplications: data.duplications
            });
            _this.source.set({
              duplicationFiles: data.files
            });
            _this.skipRemovedFiles();
            return _this.augmentWithDuplications(data.duplications);
          };
        })(this));
      };

      DuplicationsMixin.prototype.skipRemovedFiles = function() {
        var deletedFiles, duplications;
        duplications = this.source.get('duplications');
        deletedFiles = false;
        duplications = _.map(duplications, function(d) {
          var blocks;
          blocks = _.filter(d.blocks, function(b) {
            return b._ref;
          });
          if (blocks.length !== d.blocks.length) {
            deletedFiles = true;
          }
          return {
            blocks: blocks
          };
        });
        this.source.set('duplications', duplications);
        return this.state.set('duplicationsInDeletedFiles', deletedFiles);
      };

      DuplicationsMixin.prototype.augmentWithDuplications = function(duplications) {
        var formattedSource;
        formattedSource = this.source.get('formattedSource');
        if (!formattedSource) {
          return;
        }
        formattedSource.forEach(function(line) {
          var lineDuplications;
          lineDuplications = [];
          duplications.forEach(function(d, i) {
            var duplicated;
            duplicated = false;
            d.blocks.forEach(function(b) {
              var lineFrom, lineTo;
              if (b._ref === '1') {
                lineFrom = b.from;
                lineTo = b.from + b.size;
                if (line.lineNumber >= lineFrom && line.lineNumber <= lineTo) {
                  return duplicated = true;
                }
              }
            });
            return lineDuplications.push(duplicated ? i + 1 : false);
          });
          return line.duplications = lineDuplications;
        });
        return this.source.set('formattedSource', formattedSource);
      };

      DuplicationsMixin.prototype.showDuplications = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('duplications', true);
        if (store) {
          this.storeSettings();
        }
        if (!this.state.get('hasDuplications')) {
          return this.requestDuplications(this.key).done((function(_this) {
            return function() {
              return _this.sourceView.render();
            };
          })(this));
        } else {
          return this.sourceView.render();
        }
      };

      DuplicationsMixin.prototype.hideDuplications = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('duplications', false);
        if (store) {
          this.storeSettings();
        }
        return this.sourceView.render();
      };

      DuplicationsMixin.prototype.filterByDuplications = function() {
        var requests;
        requests = [this.requestDuplications(this.key)];
        if (this.settings.get('issues') && !this.state.get('hasIssues')) {
          requests.push(this.requestIssues(this.key));
        }
        return $.when.apply($, requests).done((function(_this) {
          return function() {
            return _this._filterByDuplications();
          };
        })(this));
      };

      DuplicationsMixin.prototype._filterByDuplications = function() {
        var duplications;
        duplications = this.source.get('duplications');
        this.settings.set('duplications', true);
        this.sourceView.resetShowBlocks();
        duplications.forEach((function(_this) {
          return function(d) {
            return d.blocks.forEach(function(b) {
              var lineFrom, lineTo;
              if (b._ref === '1') {
                lineFrom = b.from;
                lineTo = b.from + b.size;
                return _this.sourceView.addShowBlock(lineFrom - LINES_AROUND_DUPLICATION, lineTo + LINES_AROUND_DUPLICATION);
              }
            });
          };
        })(this));
        return this.sourceView.render();
      };

      return DuplicationsMixin;

    })();
  });

}).call(this);

(function() {
  define('component-viewer/mixins/main-scm',[], function() {
    var $, API_SCM, SCMMixin;
    $ = jQuery;
    API_SCM = "" + baseUrl + "/api/sources/scm";
    return SCMMixin = (function() {
      function SCMMixin() {}

      SCMMixin.prototype.requestSCM = function(key) {
        return $.get(API_SCM, {
          key: key
        }, (function(_this) {
          return function(data) {
            if ((data != null ? data.scm : void 0) != null) {
              _this.state.set('hasSCM', true);
              _this.source.set({
                scm: data.scm
              });
              return _this.augmentWithSCM(data.scm);
            }
          };
        })(this));
      };

      SCMMixin.prototype.augmentWithSCM = function(scm) {
        var formattedSource, scmCurrent, scmDetails, scmIndex, scmLength;
        formattedSource = this.source.get('formattedSource');
        scmLength = scm.length;
        if (scmLength > 0) {
          scmIndex = 0;
          scmCurrent = scm[scmIndex];
          scmDetails = {};
          formattedSource.forEach(function(line) {
            if (line.lineNumber === scmCurrent[0]) {
              scmDetails = {
                author: scmCurrent[1],
                date: scmCurrent[2]
              };
              if (scmIndex < scmLength - 1) {
                scmIndex++;
                scmCurrent = scm[scmIndex];
              }
            }
            return line.scm = scmDetails;
          });
          return this.source.set('formattedSource', formattedSource);
        }
      };

      SCMMixin.prototype.showSCM = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('scm', true);
        if (store) {
          this.storeSettings();
        }
        if (!this.state.get('hasSCM')) {
          return this.requestSCM(this.key).done((function(_this) {
            return function() {
              return _this.sourceView.render();
            };
          })(this));
        } else {
          return this.sourceView.render();
        }
      };

      SCMMixin.prototype.hideSCM = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('scm', false);
        if (store) {
          this.storeSettings();
        }
        return this.sourceView.render();
      };

      SCMMixin.prototype.filterByModifiedLines = function() {
        return this.filterBySCM();
      };

      SCMMixin.prototype.filterBySCM = function() {
        var requests;
        requests = [this.requestSCM(this.key)];
        if (this.settings.get('issues') && !this.state.get('hasIssues')) {
          requests.push(this.requestIssues(this.key));
        }
        return $.when.apply($, requests).done((function(_this) {
          return function() {
            return _this._filterBySCM();
          };
        })(this));
      };

      SCMMixin.prototype._filterBySCM = function() {
        var formattedSource, period, periodDate, predicate, scmBlockLine;
        formattedSource = this.source.get('formattedSource');
        period = this.state.get('period');
        this.settings.set('scm', true);
        if (period == null) {
          return this.showAllLines();
        } else {
          periodDate = period.get('sinceDate');
        }
        this.sourceView.resetShowBlocks();
        scmBlockLine = 1;
        predicate = false;
        formattedSource.forEach((function(_this) {
          return function(line) {
            var scmBlockDate;
            scmBlockDate = new Date(line.scm.date);
            if (scmBlockDate >= periodDate) {
              if (predicate === false) {
                scmBlockLine = line.lineNumber;
              }
              return predicate = true;
            } else if (predicate === true) {
              predicate = false;
              return _this.sourceView.addShowBlock(scmBlockLine, line.lineNumber - 1);
            }
          };
        })(this));
        if (predicate) {
          this.sourceView.addShowBlock(scmBlockLine, _.size(this.source.get('source')));
        }
        return this.sourceView.render();
      };

      return SCMMixin;

    })();
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/workspace',['backbone.marionette', 'templates/component-viewer'], function(Marionette, Templates) {
    var $, WorkspaceView;
    $ = jQuery;
    return WorkspaceView = (function(_super) {
      __extends(WorkspaceView, _super);

      function WorkspaceView() {
        return WorkspaceView.__super__.constructor.apply(this, arguments);
      }

      WorkspaceView.prototype.template = Templates['cw-workspace'];

      WorkspaceView.prototype.events = {
        'click .js-toggle-workspace': 'toggleWorkspace',
        'click .component-viewer-workspace-item > a[data-key]': 'goToWorkspaceItem',
        'click .component-viewer-workspace-option > a[data-key]': 'goToWorkspaceOption'
      };

      WorkspaceView.prototype.onRender = function() {
        return this.delegateEvents();
      };

      WorkspaceView.prototype.toggleWorkspace = function() {
        return this.options.main.toggleWorkspace(true);
      };

      WorkspaceView.prototype.goToWorkspaceItem = function(e) {
        var key, workspace, workspaceItem, workspaceItemOptions;
        key = $(e.currentTarget).data('key');
        workspace = this.options.main.workspace;
        workspaceItem = workspace.findWhere({
          key: key
        });
        workspaceItem.set('active', true);
        workspaceItemOptions = workspaceItem.get('options');
        workspaceItemOptions.forEach(function(option) {
          return option.active = false;
        });
        return this.options.main._open(key);
      };

      WorkspaceView.prototype.goToWorkspaceOption = function(e) {
        var key, workspace, workspaceItem, workspaceItemOptions, workspaceKey;
        workspaceKey = $(e.currentTarget).data('workspace-key');
        key = $(e.currentTarget).data('key');
        workspace = this.options.main.workspace;
        workspaceItem = workspace.findWhere({
          key: workspaceKey
        });
        workspaceItem.set('active', false);
        workspaceItemOptions = workspaceItem.get('options');
        workspaceItemOptions.forEach(function(option) {
          return option.active = option.key === key;
        });
        return this.options.main._open(key);
      };

      WorkspaceView.prototype.serializeData = function() {
        return _.extend(WorkspaceView.__super__.serializeData.apply(this, arguments), {
          workspace: this.options.main.workspace.toJSON(),
          settings: this.options.main.settings.toJSON()
        });
      };

      return WorkspaceView;

    })(Marionette.ItemView);
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

  define('component-viewer/coverage-popup',['backbone.marionette', 'templates/component-viewer', 'common/popup', 'component-viewer/utils'], function(Marionette, Templates, Popup, utils) {
    var $, CoveragePopupView;
    $ = jQuery;
    return CoveragePopupView = (function(_super) {
      __extends(CoveragePopupView, _super);

      function CoveragePopupView() {
        return CoveragePopupView.__super__.constructor.apply(this, arguments);
      }

      CoveragePopupView.prototype.template = Templates['cw-coverage-popup'];

      CoveragePopupView.prototype.events = {
        'click a[data-key]': 'goToFile'
      };

      CoveragePopupView.prototype.onRender = function() {
        var source, sourceOffset, trigger, triggerOffset;
        source = this.options.main.sourceView.$el;
        sourceOffset = source.offset();
        trigger = this.options.triggerEl;
        triggerOffset = trigger.offset();
        this.$el.detach().appendTo(source).css({
          top: triggerOffset.top - sourceOffset.top + source.scrollTop(),
          left: triggerOffset.left - sourceOffset.left + source.scrollLeft() + trigger.outerWidth()
        });
        return this.attachCloseEvents();
      };

      CoveragePopupView.prototype.goToFile = function(e) {
        var el, files, key, method;
        el = $(e.currentTarget);
        key = el.data('key');
        method = el.data('method');
        files = this.model.get('files');
        this.options.main.addTransition('coverage', _.map(files, function(file) {
          var x;
          x = utils.splitLongName(file.longName);
          return {
            key: file.key,
            name: x.name,
            subname: x.dir,
            active: file.key === key
          };
        }));
        this.options.main.state.unset('activeHeaderTab');
        this.options.main.state.unset('activeHeaderItem');
        this.options.main._open(key);
        return this.options.main.on('loaded', (function(_this) {
          return function() {
            _this.options.main.off('loaded');
            return _this.options.main.headerView.enableBar('tests').done(function() {
              if (method != null) {
                return _this.options.main.headerView.enableUnitTest(method);
              }
            });
          };
        })(this));
      };

      CoveragePopupView.prototype.serializeData = function() {
        var files, testFiles, tests;
        files = this.model.get('files');
        tests = _.groupBy(this.model.get('tests'), '_ref');
        testFiles = _.map(tests, function(testSet, fileRef) {
          return {
            file: files[fileRef],
            tests: testSet
          };
        });
        return {
          testFiles: testFiles
        };
      };

      return CoveragePopupView;

    })(Popup);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/duplication-popup',['backbone.marionette', 'templates/component-viewer', 'common/popup', 'component-viewer/utils'], function(Marionette, Templates, Popup, utils) {
    var $, DuplicationPopupView;
    $ = jQuery;
    return DuplicationPopupView = (function(_super) {
      __extends(DuplicationPopupView, _super);

      function DuplicationPopupView() {
        return DuplicationPopupView.__super__.constructor.apply(this, arguments);
      }

      DuplicationPopupView.prototype.template = Templates['cw-duplication-popup'];

      DuplicationPopupView.prototype.events = {
        'click a[data-key]': 'goToFile'
      };

      DuplicationPopupView.prototype.onRender = function() {
        var source, sourceOffset, trigger, triggerOffset;
        source = this.options.main.sourceView.$el;
        sourceOffset = source.offset();
        trigger = this.options.triggerEl;
        triggerOffset = trigger.offset();
        this.$el.detach().appendTo(source).css({
          top: triggerOffset.top - sourceOffset.top + source.scrollTop(),
          left: triggerOffset.left - sourceOffset.left + source.scrollLeft() + trigger.outerWidth()
        });
        return this.attachCloseEvents();
      };

      DuplicationPopupView.prototype.goToFile = function(e) {
        var files, key, line, options;
        key = $(e.currentTarget).data('key');
        line = $(e.currentTarget).data('line');
        files = this.options.main.source.get('duplicationFiles');
        options = this.collection.map(function(item) {
          var file, x;
          file = files[item.get('_ref')];
          x = utils.splitLongName(file.name);
          return {
            key: file.key,
            name: x.name,
            subname: x.dir,
            component: {
              projectName: file.projectName,
              subProjectName: file.subProjectName
            },
            active: file.key === key
          };
        });
        options = _.uniq(options, function(item) {
          return item.key;
        });
        this.options.main.addTransition('duplication', options);
        if (key === this.options.main.component.get('key')) {
          this.options.main.scrollToLine(line);
          return this.options.main.workspaceView.render();
        } else {
          this.options.main._open(key);
          return this.options.main.on('sized', (function(_this) {
            return function() {
              _this.options.main.off('sized');
              return _this.options.main.scrollToLine(line);
            };
          })(this));
        }
      };

      DuplicationPopupView.prototype.serializeData = function() {
        var duplications, files, groupedBlocks;
        files = this.options.main.source.get('duplicationFiles');
        groupedBlocks = _.groupBy(this.collection.toJSON(), '_ref');
        duplications = _.map(groupedBlocks, function(blocks, fileRef) {
          return {
            blocks: blocks,
            file: files[fileRef]
          };
        });
        duplications = _.sortBy(duplications, (function(_this) {
          return function(d) {
            var a, b, c;
            a = d.file.projectName !== _this.options.main.component.get('projectName');
            b = d.file.subProjectName !== _this.options.main.component.get('subProjectName');
            c = d.file.key !== _this.options.main.component.get('key');
            return '' + a + b + c;
          };
        })(this));
        return {
          component: this.options.main.component.toJSON(),
          duplications: duplications
        };
      };

      return DuplicationPopupView;

    })(Popup);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/time-changes-popup',['backbone.marionette', 'templates/component-viewer', 'common/popup'], function(Marionette, Templates, Popup) {
    var $, TimeChangesPopupView;
    $ = jQuery;
    return TimeChangesPopupView = (function(_super) {
      __extends(TimeChangesPopupView, _super);

      function TimeChangesPopupView() {
        return TimeChangesPopupView.__super__.constructor.apply(this, arguments);
      }

      TimeChangesPopupView.prototype.template = Templates['cw-time-changes-popup'];

      TimeChangesPopupView.prototype.events = {
        'click a[data-period]': 'enablePeriod'
      };

      TimeChangesPopupView.prototype.enablePeriod = function(e) {
        var period;
        period = $(e.currentTarget).data('period');
        return this.trigger('change', period);
      };

      TimeChangesPopupView.prototype.serializeData = function() {
        return {
          component: this.options.main.component.toJSON(),
          periods: this.options.main.periods.toJSON(),
          prefix: this.options.prefix || 'Δ'
        };
      };

      return TimeChangesPopupView;

    })(Popup);
  });

}).call(this);

define('templates/issue',['handlebars'], function(Handlebars) {

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

this["SS"]["Templates"]["assign-form"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  buffer += "<table class=\"width100\">\n  <tr>\n    <td>\n      <input type=\"text\" id=\"issue-assignee-select\">\n      <input id=\"issue-assign-submit\" type=\"submit\" value=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.assign.submit", options) : helperMissing.call(depth0, "t", "issue.assign.submit", options)))
    + "\">&nbsp;\n      <a id=\"issue-assign-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n    </td>\n  </tr>\n</table>";
  return buffer;
  });

this["SS"]["Templates"]["change-log"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n    <tr>\n      <td class=\"thin left top\" nowrap>"
    + escapeExpression((helper = helpers.dt || (depth0 && depth0.dt),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.creationDate), options) : helperMissing.call(depth0, "dt", (depth0 && depth0.creationDate), options)))
    + "</td>\n      <td class=\"thin left top\" nowrap>";
  if (helper = helpers.userName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.userName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</td>\n      <td class=\"left top\">\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.diffs), {hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </td>\n    </tr>\n  ";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n          "
    + escapeExpression((helper = helpers.changelog || (depth0 && depth0.changelog),options={hash:{},data:data},helper ? helper.call(depth0, depth0, options) : helperMissing.call(depth0, "changelog", depth0, options)))
    + "<br>\n        ";
  return buffer;
  }

  buffer += "<table class=\"spaced\">\n  <tbody>\n  <tr>\n    <td class=\"thin left top\" nowrap>"
    + escapeExpression((helper = helpers.dt || (depth0 && depth0.dt),options={hash:{},data:data},helper ? helper.call(depth0, ((stack1 = (depth0 && depth0.issue)),stack1 == null || stack1 === false ? stack1 : stack1.creationDate), options) : helperMissing.call(depth0, "dt", ((stack1 = (depth0 && depth0.issue)),stack1 == null || stack1 === false ? stack1 : stack1.creationDate), options)))
    + "</td>\n    <td class=\"thin left top\" nowrap></td>\n    <td class=\"left top\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "created", options) : helperMissing.call(depth0, "t", "created", options)))
    + "</td>\n  </tr>\n  ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.items), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </tbody>\n</table>";
  return buffer;
  });

this["SS"]["Templates"]["comment-form"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); partials = this.merge(partials, Handlebars.partials); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "save", options) : helperMissing.call(depth0, "t", "save", options)));
  }

function program3(depth0,data) {
  
  var helper, options;
  return escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.comment.submit", options) : helperMissing.call(depth0, "t", "issue.comment.submit", options)));
  }

  buffer += "<table class=\"width100\">\n  <tr>\n    <td style=\"vertical-align:top\" colspan=\"2\">\n      <textarea id=\"issue-comment-text\" rows=\"4\" name=\"text\" style=\"width: 100%\">"
    + escapeExpression((helper = helpers.show || (depth0 && depth0.show),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.raw), (depth0 && depth0.markdown), options) : helperMissing.call(depth0, "show", (depth0 && depth0.raw), (depth0 && depth0.markdown), options)))
    + "</textarea>\n    </td>\n  </tr>\n  <tr>\n    <td style=\"padding-top: 5px\">\n      <input id=\"issue-comment-submit\" type=\"submit\"\n             value=\"";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.id), {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\" disabled>\n      <a id=\"issue-comment-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n    </td>\n    <td align=\"right\">\n      ";
  stack1 = self.invokePartial(partials['_markdown-tips'], '_markdown-tips', depth0, helpers, partials, data);
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </td>\n  </tr>\n</table>";
  return buffer;
  });

this["SS"]["Templates"]["issue"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <li>\n        <a id=\"issue-comment\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.comment.formlink", options) : helperMissing.call(depth0, "t", "issue.comment.formlink", options)))
    + "</a>\n      </li>\n    ";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "("
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.resolution", (depth0 && depth0.resolution), options) : helperMissing.call(depth0, "t", "issue.resolution", (depth0 && depth0.resolution), options)))
    + ")";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.transitions), {hash:{},inverse:self.noop,fn:self.program(6, program6, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }
function program6(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n          <a class=\"link-action issue-transition spacer-left\" data-transition=\""
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.transition", depth0, options) : helperMissing.call(depth0, "t", "issue.transition", depth0, options)))
    + "</a>\n        ";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n    <li>\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.assigneeName), {hash:{},inverse:self.program(11, program11, data),fn:self.program(9, program9, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </li>\n    ";
  return buffer;
  }
function program9(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <a id=\"issue-assign\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "assigned_to", options) : helperMissing.call(depth0, "t", "assigned_to", options)))
    + "</a> ";
  if (helper = helpers.assigneeName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.assigneeName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>\n      ";
  return buffer;
  }

function program11(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <a id=\"issue-assign\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.assign.formlink", options) : helperMissing.call(depth0, "t", "issue.assign.formlink", options)))
    + "</a>\n        ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(12, program12, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), "assign_to_me", options) : helperMissing.call(depth0, "inArray", (depth0 && depth0.actions), "assign_to_me", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      ";
  return buffer;
  }
function program12(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n          [<a id=\"issue-assign-to-me\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.assign.to_me", options) : helperMissing.call(depth0, "t", "issue.assign.to_me", options)))
    + "</a>]\n        ";
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.assigneeName), {hash:{},inverse:self.noop,fn:self.program(15, program15, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program15(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <li>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "assigned_to", options) : helperMissing.call(depth0, "t", "assigned_to", options)))
    + " <strong>";
  if (helper = helpers.assigneeName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.assigneeName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</strong></li>\n      ";
  return buffer;
  }

function program17(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      <li>\n        ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.actionPlanName), {hash:{},inverse:self.program(20, program20, data),fn:self.program(18, program18, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </li>\n    ";
  return buffer;
  }
function program18(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n          <a id=\"issue-plan\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.planned_for", options) : helperMissing.call(depth0, "t", "issue.planned_for", options)))
    + "</a> ";
  if (helper = helpers.actionPlanName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.actionPlanName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n        ";
  return buffer;
  }

function program20(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n          <a id=\"issue-plan\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.do_plan", options) : helperMissing.call(depth0, "t", "issue.do_plan", options)))
    + "</a>\n        ";
  return buffer;
  }

function program22(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.actionPlanName), {hash:{},inverse:self.noop,fn:self.program(23, program23, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program23(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n        <li>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.planned_for", options) : helperMissing.call(depth0, "t", "issue.planned_for", options)))
    + " <strong>";
  if (helper = helpers.actionPlanName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.actionPlanName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</strong></li>\n      ";
  return buffer;
  }

function program25(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <li>\n        <div class=\"dropdown\">\n          <a class=\"link-action link-more\" onclick=\"showDropdownMenuOnElement($j(this).next('.dropdown-menu')); return false;\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "more_actions", options) : helperMissing.call(depth0, "t", "more_actions", options)))
    + "</a>\n          <ul style=\"display: none\" class=\"dropdown-menu\">\n            ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(26, program26, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), "set_severity", options) : helperMissing.call(depth0, "inArray", (depth0 && depth0.actions), "set_severity", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n            ";
  stack1 = (helper = helpers.pluginActions || (depth0 && depth0.pluginActions),options={hash:{},inverse:self.noop,fn:self.program(28, program28, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), options) : helperMissing.call(depth0, "pluginActions", (depth0 && depth0.actions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n          </ul>\n        </div>\n      </li>\n    ";
  return buffer;
  }
function program26(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n              <li>\n                <a id=\"issue-set-severity\" class=\"link-action spacer-right\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.set_severity", options) : helperMissing.call(depth0, "t", "issue.set_severity", options)))
    + "</a>\n              </li>\n            ";
  return buffer;
  }

function program28(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n              <li>\n                <a class=\"link-action spacer-right issue-action\" data-action=\""
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.action", depth0, "formlink", options) : helperMissing.call(depth0, "t", "issue.action", depth0, "formlink", options)))
    + "</a>\n              </li>\n            ";
  return buffer;
  }

function program30(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(31, program31, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), "set_severity", options) : helperMissing.call(depth0, "inArray", (depth0 && depth0.actions), "set_severity", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program31(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n        <li>\n          <a id=\"issue-set-severity\" class=\"link-action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.set_severity", options) : helperMissing.call(depth0, "t", "issue.set_severity", options)))
    + "</a>\n        </li>\n      ";
  return buffer;
  }

function program33(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <li>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.technical_debt_short", options) : helperMissing.call(depth0, "t", "issue.technical_debt_short", options)))
    + ": ";
  if (helper = helpers.debt) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.debt); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>\n    ";
  return buffer;
  }

function program35(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "<li>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "reporter", options) : helperMissing.call(depth0, "t", "reporter", options)))
    + ": ";
  if (helper = helpers.reporterName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.reporterName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>";
  return buffer;
  }

function program37(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "<li>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "author", options) : helperMissing.call(depth0, "t", "author", options)))
    + ": ";
  if (helper = helpers.author) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.author); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>";
  return buffer;
  }

function program39(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      <div class=\"code-issue-comment\" data-comment-key=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n        <h4>\n          <i class=\"icon-comment\"></i>\n          <b>";
  if (helper = helpers.userName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.userName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</b>\n          ("
    + escapeExpression((helper = helpers.fromNow || (depth0 && depth0.fromNow),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.createdAt), options) : helperMissing.call(depth0, "fromNow", (depth0 && depth0.createdAt), options)))
    + ")\n\n          ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.updatable), {hash:{},inverse:self.noop,fn:self.program(40, program40, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n        </h4>\n        <div class=\"markdown\">";
  stack1 = (helper = helpers.show || (depth0 && depth0.show),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.html), (depth0 && depth0.htmlText), options) : helperMissing.call(depth0, "show", (depth0 && depth0.html), (depth0 && depth0.htmlText), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</div>\n      </div>\n    ";
  return buffer;
  }
function program40(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n            &nbsp;&nbsp;\n            <a class=\"link-action issue-comment-edit\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "edit", options) : helperMissing.call(depth0, "t", "edit", options)))
    + "</a>&nbsp;\n            <a class=\"link-action link-red spacer-right issue-comment-delete\"\n               data-confirm-msg=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.comment.delete_confirm_message", options) : helperMissing.call(depth0, "t", "issue.comment.delete_confirm_message", options)))
    + "\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "delete", options) : helperMissing.call(depth0, "t", "delete", options)))
    + "</a>\n          ";
  return buffer;
  }

  buffer += "<div class=\"code-issue code-issue-collapsed\" data-issue-key=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-issue-component=\"";
  if (helper = helpers.component) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.component); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" data-issue-rule=\"";
  if (helper = helpers.rule) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.rule); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n  <div class=\"code-issue-name code-issue-toggle\">\n    <div class=\"code-issue-name-rule\">\n      "
    + escapeExpression((helper = helpers.severityIcon || (depth0 && depth0.severityIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.severity), options) : helperMissing.call(depth0, "severityIcon", (depth0 && depth0.severity), options)))
    + "&nbsp;<span class=\"rulename\">";
  if (helper = helpers.message) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.message); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n    </div>\n\n    <div class=\"code-issue-permalink\">\n      <a target=\"_blank\" href=\"";
  if (helper = helpers.permalink) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.permalink); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n        <i class=\"icon-link\"></i>\n      </a>\n    </div>\n  </div>\n\n\n  <ul class=\"code-issue-actions code-issue-list\">\n    ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), "comment", options) : helperMissing.call(depth0, "inArray", (depth0 && depth0.actions), "comment", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n    <li>\n      "
    + escapeExpression((helper = helpers.statusIcon || (depth0 && depth0.statusIcon),options={hash:{},data:data},helper ? helper.call(depth0, (depth0 && depth0.status), options) : helperMissing.call(depth0, "statusIcon", (depth0 && depth0.status), options)))
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.status", (depth0 && depth0.status), options) : helperMissing.call(depth0, "t", "issue.status", (depth0 && depth0.status), options)))
    + "\n      ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.resolution), {hash:{},inverse:self.noop,fn:self.program(3, program3, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n      ";
  stack1 = (helper = helpers.ifNotEmpty || (depth0 && depth0.ifNotEmpty),options={hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.transitions), options) : helperMissing.call(depth0, "ifNotEmpty", (depth0 && depth0.transitions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </li>\n\n\n    ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.program(14, program14, data),fn:self.program(8, program8, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), "assign", options) : helperMissing.call(depth0, "inArray", (depth0 && depth0.actions), "assign", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n    ";
  stack1 = (helper = helpers.inArray || (depth0 && depth0.inArray),options={hash:{},inverse:self.program(22, program22, data),fn:self.program(17, program17, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), "plan", options) : helperMissing.call(depth0, "inArray", (depth0 && depth0.actions), "plan", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n\n    ";
  stack1 = (helper = helpers.ifHasExtraActions || (depth0 && depth0.ifHasExtraActions),options={hash:{},inverse:self.program(30, program30, data),fn:self.program(25, program25, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.actions), options) : helperMissing.call(depth0, "ifHasExtraActions", (depth0 && depth0.actions), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.debt), {hash:{},inverse:self.noop,fn:self.program(33, program33, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.reporterName), {hash:{},inverse:self.noop,fn:self.program(35, program35, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.author), {hash:{},inverse:self.noop,fn:self.program(37, program37, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </ul>\n\n  <div class=\"code-issue-form\" style=\"display: none;\"></div>\n\n\n  <div class=\"code-issue-details\">\n    <ul class=\"code-issue-tabs\">\n      <li>\n        <a class=\"js-tab-link\" href=\"#tab-issue-rule\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "rule", options) : helperMissing.call(depth0, "t", "rule", options)))
    + "</a>\n      </li>\n      <li>\n        <a class=\"js-tab-link\" href=\"#tab-issue-changelog\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "changelog", options) : helperMissing.call(depth0, "t", "changelog", options)))
    + "</a>\n      </li>\n    </ul>\n\n    <div id=\"tab-issue-rule\" class=\"js-tab\">\n      <div class=\"rule-desc\"></div>\n    </div>\n\n    <div id=\"tab-issue-changelog\" class=\"js-tab\"></div>\n  </div>\n\n\n  <div class=\"code-issue-comments\">\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.comments), {hash:{},inverse:self.noop,fn:self.program(39, program39, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </div>\n</div>\n";
  return buffer;
  });

this["SS"]["Templates"]["manual-issue"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n        <option value=\"";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</option>\n      ";
  return buffer;
  }

  buffer += "<form action=\"\" class=\"js-manual-issue-form code-issue-create-form\">\n  \n  \n  \n  \n  \n  \n  \n  \n  \n  \n\n  <input type=\"hidden\" name=\"line\" value=\"";
  if (helper = helpers.line) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.line); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n  <input type=\"hidden\" name=\"component\" value=\"";
  if (helper = helpers.component) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.component); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n\n  <div class=\"code-issue-name\">\n    <select name=\"rule\">\n      ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.rules), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    </select>\n  </div>\n\n  <div class=\"code-issue-msg\">\n    <table class=\"width100\">\n      <tr>\n        <td>\n          <textarea rows=\"4\" name=\"message\" class=\"width100 marginbottom5\"></textarea>\n        </td>\n      </tr>\n      <tr>\n        <td class=\"js-submit\">\n          <input type=\"submit\" value=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "create", options) : helperMissing.call(depth0, "t", "create", options)))
    + "\">\n          <a class=\"js-cancel\" href=\"#\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n        </td>\n        <td class=\"js-spinner\" style=\"display: none;\">\n          <i class=\"spinner\"></i>\n        </td>\n      </tr>\n    </table>\n    <div class=\"code-issue-errors error hidden\"></div>\n  </div>\n\n</form>\n";
  return buffer;
  });

this["SS"]["Templates"]["plan-form"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression, functionType="function", self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n  <select id=\"issue-detail-plan-select\">\n    ";
  stack1 = helpers['if'].call(depth0, ((stack1 = (depth0 && depth0.issue)),stack1 == null || stack1 === false ? stack1 : stack1.actionPlan), {hash:{},inverse:self.noop,fn:self.program(2, program2, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.items), {hash:{},inverse:self.noop,fn:self.program(4, program4, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n  </select>\n  <input id=\"issue-plan-submit\" type=\"submit\" value=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.plan.submit", options) : helperMissing.call(depth0, "t", "issue.plan.submit", options)))
    + "\">&nbsp;\n";
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n      <option value=\"#unplan\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.unplan.submit", options) : helperMissing.call(depth0, "t", "issue.unplan.submit", options)))
    + "</option>\n    ";
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = "", stack1, helper, options;
  buffer += "\n      ";
  stack1 = (helper = helpers.notEq || (depth0 && depth0.notEq),options={hash:{},inverse:self.noop,fn:self.program(5, program5, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.status), "CLOSED", options) : helperMissing.call(depth0, "notEq", (depth0 && depth0.status), "CLOSED", options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n    ";
  return buffer;
  }
function program5(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "\n        <option value=\""
    + escapeExpression(((stack1 = (depth0 && depth0.key)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + "\">"
    + escapeExpression(((stack1 = (depth0 && depth0.name)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + " ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.fDeadLine), {hash:{},inverse:self.noop,fn:self.program(6, program6, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</option>\n      ";
  return buffer;
  }
function program6(depth0,data) {
  
  var buffer = "", stack1;
  buffer += "("
    + escapeExpression(((stack1 = (depth0 && depth0.fDeadLine)),typeof stack1 === functionType ? stack1.apply(depth0) : stack1))
    + ")";
  return buffer;
  }

function program8(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n  <span class=\"error\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.plan.error.plan_must_be_created_first", options) : helperMissing.call(depth0, "t", "issue.plan.error.plan_must_be_created_first", options)))
    + "</span>\n";
  return buffer;
  }

  stack1 = helpers['if'].call(depth0, (depth0 && depth0.items), {hash:{},inverse:self.program(8, program8, data),fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n<a id=\"issue-plan-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n";
  return buffer;
  });

this["SS"]["Templates"]["rule"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, options, functionType="function", escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

function program1(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "<div class=\"marginbottom10\">";
  if (helper = helpers.htmlNote) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.htmlNote); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</div>";
  return buffer;
  }

function program3(depth0,data) {
  
  var buffer = "", stack1, helper;
  buffer += "\n    <li>";
  if (helper = helpers.debtCharName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.debtCharName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + " > ";
  if (helper = helpers.debtSubCharName) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.debtSubCharName); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>\n  ";
  return buffer;
  }

function program5(depth0,data) {
  
  var buffer = "", helper, options;
  buffer += "\n    <li>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.technical_debt_deleted", options) : helperMissing.call(depth0, "t", "issue.technical_debt_deleted", options)))
    + "</li>\n  ";
  return buffer;
  }

  buffer += "<div class=\"rule-desc\">\n  <h1 class=\"marginbottom10\">";
  if (helper = helpers.name) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.name); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</h1>\n  <div class=\"marginbottom10\">";
  if (helper = helpers.htmlDesc) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.htmlDesc); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "</div>\n  ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.htmlNote), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</div>\n\n<ul class=\"note code-issue-bar\">\n  <li>";
  if (helper = helpers.key) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.key); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</li>\n  ";
  stack1 = (helper = helpers.all || (depth0 && depth0.all),options={hash:{},inverse:self.program(5, program5, data),fn:self.program(3, program3, data),data:data},helper ? helper.call(depth0, (depth0 && depth0.debtCharName), (depth0 && depth0.debtSubCharName), options) : helperMissing.call(depth0, "all", (depth0 && depth0.debtCharName), (depth0 && depth0.debtSubCharName), options));
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n</ul>\n";
  return buffer;
  });

this["SS"]["Templates"]["set-severity-form"] = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


  buffer += "<table class=\"width100\">\n  <tr>\n    <td style=\"vertical-align:top\">\n      <select id=\"issue-set-severity-select\" autofocus>\n        <option class=\"sev_BLOCKER\" value=\"BLOCKER\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity.BLOCKER", options) : helperMissing.call(depth0, "t", "severity.BLOCKER", options)))
    + "</option>\n        <option class=\"sev_CRITICAL\" value=\"CRITICAL\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity.CRITICAL", options) : helperMissing.call(depth0, "t", "severity.CRITICAL", options)))
    + "</option>\n        <option class=\"sev_MAJOR\" value=\"MAJOR\" selected>"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity.MAJOR", options) : helperMissing.call(depth0, "t", "severity.MAJOR", options)))
    + "</option>\n        <option class=\"sev_MINOR\" value=\"MINOR\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity.MINOR", options) : helperMissing.call(depth0, "t", "severity.MINOR", options)))
    + "</option>\n        <option class=\"sev_INFO\" value=\"INFO\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "severity.INFO", options) : helperMissing.call(depth0, "t", "severity.INFO", options)))
    + "</option>\n      </select>\n\n      <input id=\"issue-set-severity-submit\" type=\"submit\" value=\""
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "issue.set_severity.submit", options) : helperMissing.call(depth0, "t", "issue.set_severity.submit", options)))
    + "\">\n      <a id=\"issue-set-severity-cancel\" class=\"action\">"
    + escapeExpression((helper = helpers.t || (depth0 && depth0.t),options={hash:{},data:data},helper ? helper.call(depth0, "cancel", options) : helperMissing.call(depth0, "t", "cancel", options)))
    + "</a>\n    </td>\n  </tr>\n</table>";
  return buffer;
  });

return this["SS"]["Templates"];

});
(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/manual-issue-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var $, API_ADD_MANUAL_ISSUE, API_ISSUE;
    $ = jQuery;
    API_ISSUE = "" + baseUrl + "/api/issues/show";
    API_ADD_MANUAL_ISSUE = "" + baseUrl + "/api/issues/create";
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['manual-issue'];

      _Class.prototype.events = {
        'submit .js-manual-issue-form': 'formSubmit',
        'click .js-cancel': 'cancel'
      };

      _Class.prototype.onRender = function() {
        this.delegateEvents();
        this.$('[name=rule]').select2({
          width: '250px',
          minimumResultsForSearch: 10
        });
        this.$('[name=rule]').select2('open');
        if (typeof key !== "undefined" && key !== null) {
          this.key = key.getScope();
          return key.setScope('');
        }
      };

      _Class.prototype.onClose = function() {
        if ((typeof key !== "undefined" && key !== null) && (this.key != null)) {
          return key.setScope(this.key);
        }
      };

      _Class.prototype.showSpinner = function() {
        this.$('.js-submit').hide();
        return this.$('.js-spinner').show();
      };

      _Class.prototype.hideSpinner = function() {
        this.$('.js-submit').show();
        return this.$('.js-spinner').hide();
      };

      _Class.prototype.validateFields = function() {
        var message;
        message = this.$('[name=message]');
        if (!message.val()) {
          message.addClass('invalid').focus();
          return false;
        }
        return true;
      };

      _Class.prototype.formSubmit = function(e) {
        var data;
        e.preventDefault();
        if (!this.validateFields()) {
          return;
        }
        this.showSpinner();
        data = $(e.currentTarget).serialize();
        return $.post(API_ADD_MANUAL_ISSUE, data).done((function(_this) {
          return function(r) {
            return _this.addIssue(r.issue.key);
          };
        })(this)).fail((function(_this) {
          return function(r) {
            var _ref;
            _this.hideSpinner();
            if (((_ref = r.responseJSON) != null ? _ref.errors : void 0) != null) {
              return _this.showError(_.pluck(r.responseJSON.errors, 'msg').join('. '));
            }
          };
        })(this));
      };

      _Class.prototype.addIssue = function(key) {
        return $.get(API_ISSUE, {
          key: key
        }, (function(_this) {
          return function(r) {
            _this.trigger('add', r.issue);
            return _this.close();
          };
        })(this));
      };

      _Class.prototype.showError = function(msg) {
        return this.$('.code-issue-errors').removeClass('hidden').text(msg);
      };

      _Class.prototype.cancel = function(e) {
        e.preventDefault();
        return this.close();
      };

      _Class.prototype.serializeData = function() {
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          line: this.options.line,
          component: this.options.component,
          rules: _.sortBy(this.options.rules, 'name')
        });
      };

      return _Class;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/line-actions-popup',['backbone.marionette', 'templates/component-viewer', 'common/popup', 'issue/manual-issue-view'], function(Marionette, Templates, Popup, ManualIssueView) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-line-options-popup'];

      _Class.prototype.events = {
        'click .js-get-permalink': 'getPermalink',
        'click .js-add-manual-issue': 'addManualIssue'
      };

      _Class.prototype.onRender = function() {
        var source, sourceOffset, trigger, triggerOffset;
        source = this.options.main.sourceView.$el;
        sourceOffset = source.offset();
        trigger = this.options.triggerEl;
        triggerOffset = trigger.offset();
        this.$el.detach().appendTo(source).css({
          top: triggerOffset.top - sourceOffset.top + source.scrollTop(),
          left: triggerOffset.left - sourceOffset.left + source.scrollLeft() + trigger.outerWidth()
        });
        return this.attachCloseEvents();
      };

      _Class.prototype.getPermalink = function(e) {
        e.preventDefault();
        return this.options.main.headerView.getPermalink();
      };

      _Class.prototype.addManualIssue = function(e) {
        var component, line, manualIssueView;
        e.preventDefault();
        line = this.options.row.data('line-number');
        component = this.options.main.component.get('key');
        manualIssueView = new ManualIssueView({
          line: line,
          component: component,
          rules: this.options.main.state.get('manual_rules')
        });
        manualIssueView.render().$el.appendTo(this.options.row.find('.line'));
        return manualIssueView.on('add', (function(_this) {
          return function(issue) {
            var activeIssues, issues, showIssues;
            issues = _this.options.main.source.get('issues') || [];
            activeIssues = _this.options.main.source.get('activeIssues') || [];
            showIssues = _this.options.main.settings.get('issues');
            issues.push(issue);
            if (showIssues) {
              activeIssues.push(issue);
            } else {
              activeIssues = [issue];
            }
            _this.options.main.source.set('issues', issues);
            _this.options.main.source.set('activeIssues', activeIssues);
            _this.options.main.settings.set('issues', true);
            return _this.options.main.sourceView.render();
          };
        })(this));
      };

      _Class.prototype.serializeData = function() {
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          state: this.options.main.state.toJSON()
        });
      };

      return _Class;

    })(Popup);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/models/rule',['backbone'], function(Backbone) {
    var Rule;
    return Rule = (function(_super) {
      __extends(Rule, _super);

      function Rule() {
        return Rule.__super__.constructor.apply(this, arguments);
      }

      Rule.prototype.url = function() {
        return "" + baseUrl + "/api/rules/show/?key=" + (this.get('key'));
      };

      Rule.prototype.parse = function(r) {
        if (r.rule) {
          return r.rule;
        } else {
          return r;
        }
      };

      return Rule;

    })(Backbone.Model);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/views/rule-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var IssueDetailRuleView;
    return IssueDetailRuleView = (function(_super) {
      __extends(IssueDetailRuleView, _super);

      function IssueDetailRuleView() {
        return IssueDetailRuleView.__super__.constructor.apply(this, arguments);
      }

      IssueDetailRuleView.prototype.template = Templates['rule'];

      IssueDetailRuleView.prototype.modelEvents = {
        'change': 'render'
      };

      IssueDetailRuleView.prototype.serializeData = function() {
        return _.extend(IssueDetailRuleView.__super__.serializeData.apply(this, arguments), {
          characteristic: this.options.issue.get('characteristic'),
          subCharacteristic: this.options.issue.get('subCharacteristic')
        });
      };

      return IssueDetailRuleView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/models/change-log',['backbone'], function(Backbone) {
    var ChangeLog;
    return ChangeLog = (function(_super) {
      __extends(ChangeLog, _super);

      function ChangeLog() {
        return ChangeLog.__super__.constructor.apply(this, arguments);
      }

      ChangeLog.prototype.url = function() {
        return "" + baseUrl + "/api/issues/changelog";
      };

      ChangeLog.prototype.parse = function(r) {
        return r.changelog;
      };

      return ChangeLog;

    })(Backbone.Collection);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/views/change-log-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var IssueDetailChangeLogView;
    return IssueDetailChangeLogView = (function(_super) {
      __extends(IssueDetailChangeLogView, _super);

      function IssueDetailChangeLogView() {
        return IssueDetailChangeLogView.__super__.constructor.apply(this, arguments);
      }

      IssueDetailChangeLogView.prototype.template = Templates['change-log'];

      IssueDetailChangeLogView.prototype.collectionEvents = {
        'sync': 'render'
      };

      IssueDetailChangeLogView.prototype.serializeData = function() {
        return _.extend(IssueDetailChangeLogView.__super__.serializeData.apply(this, arguments), {
          issue: this.options.issue.toJSON()
        });
      };

      return IssueDetailChangeLogView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/collections/action-plans',['backbone'], function(Backbone) {
    var ActionPlans;
    return ActionPlans = (function(_super) {
      __extends(ActionPlans, _super);

      function ActionPlans() {
        return ActionPlans.__super__.constructor.apply(this, arguments);
      }

      ActionPlans.prototype.url = function() {
        return "" + baseUrl + "/api/action_plans/search";
      };

      ActionPlans.prototype.parse = function(r) {
        return r.actionPlans;
      };

      return ActionPlans;

    })(Backbone.Collection);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/views/assign-form-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var $, AssignFormView, ME;
    $ = jQuery;
    ME = '#me#';
    return AssignFormView = (function(_super) {
      __extends(AssignFormView, _super);

      function AssignFormView() {
        return AssignFormView.__super__.constructor.apply(this, arguments);
      }

      AssignFormView.prototype.template = Templates['assign-form'];

      AssignFormView.prototype.ui = {
        select: '#issue-assignee-select'
      };

      AssignFormView.prototype.events = {
        'click #issue-assign-cancel': 'cancel',
        'click #issue-assign-submit': 'submit'
      };

      AssignFormView.prototype.onRender = function() {
        var additionalChoices, assignee, currentUser, select2Options;
        currentUser = window.SS.currentUser;
        assignee = this.options.issue.get('assignee');
        additionalChoices = [];
        if (!assignee || currentUser !== assignee) {
          additionalChoices.push({
            id: ME,
            text: t('assigned_to_me')
          });
        }
        if (!!assignee) {
          additionalChoices.push({
            id: '',
            text: t('unassigned')
          });
        }
        select2Options = {
          allowClear: false,
          width: '250px',
          formatNoMatches: function() {
            return t('select2.noMatches');
          },
          formatSearching: function() {
            return t('select2.searching');
          },
          formatInputTooShort: function() {
            return t('select2.tooShort');
          }
        };
        if (additionalChoices.length > 0) {
          select2Options.minimumInputLength = 0;
          select2Options.query = function(query) {
            if (query.term.length === 0) {
              return query.callback({
                results: additionalChoices
              });
            } else if (query.term.length >= 2) {
              return $.ajax({
                url: baseUrl + '/api/users/search?f=s2',
                data: {
                  s: query.term
                },
                dataType: 'jsonp'
              }).done(function(data) {
                return query.callback(data);
              });
            }
          };
        } else {
          select2Options.minimumInputLength = 2;
          select2Options.ajax = {
            quietMillis: 300,
            url: baseUrl + '/api/users/search?f=s2',
            data: function(term, page) {
              return {
                s: term,
                p: page
              };
            },
            results: function(data) {
              return {
                more: data.more,
                results: data.results
              };
            }
          };
        }
        return this.ui.select.select2(select2Options).select2('open');
      };

      AssignFormView.prototype.cancel = function() {
        return this.options.detailView.updateAfterAction(false);
      };

      AssignFormView.prototype.submit = function() {
        var data;
        this.options.detailView.showActionSpinner();
        data = {
          issue: this.options.issue.get('key')
        };
        if (this.ui.select.val() === ME) {
          data.me = true;
        } else {
          data.assignee = this.ui.select.val();
        }
        return $.ajax({
          type: 'POST',
          url: baseUrl + '/api/issues/assign',
          data: data
        }).done((function(_this) {
          return function() {
            return _this.options.detailView.updateAfterAction(true);
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
            return _this.options.detailView.hideActionSpinner();
          };
        })(this));
      };

      return AssignFormView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/views/comment-form-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var $, IssueDetailCommentFormView;
    $ = jQuery;
    return IssueDetailCommentFormView = (function(_super) {
      __extends(IssueDetailCommentFormView, _super);

      function IssueDetailCommentFormView() {
        return IssueDetailCommentFormView.__super__.constructor.apply(this, arguments);
      }

      IssueDetailCommentFormView.prototype.template = Templates['comment-form'];

      IssueDetailCommentFormView.prototype.ui = {
        textarea: '#issue-comment-text',
        cancelButton: '#issue-comment-cancel',
        submitButton: '#issue-comment-submit'
      };

      IssueDetailCommentFormView.prototype.events = {
        'keyup #issue-comment-text': 'toggleSubmit',
        'click #issue-comment-cancel': 'cancel',
        'click #issue-comment-submit': 'submit'
      };

      IssueDetailCommentFormView.prototype.onDomRefresh = function() {
        return this.ui.textarea.focus();
      };

      IssueDetailCommentFormView.prototype.toggleSubmit = function() {
        return this.ui.submitButton.prop('disabled', this.ui.textarea.val().length === 0);
      };

      IssueDetailCommentFormView.prototype.cancel = function() {
        return this.options.detailView.updateAfterAction(false);
      };

      IssueDetailCommentFormView.prototype.submit = function() {
        var data, text, update, url;
        text = this.ui.textarea.val();
        update = this.model && this.model.has('key');
        url = baseUrl + '/api/issues/' + (update ? 'edit_comment' : 'add_comment');
        data = {
          text: text
        };
        if (update) {
          data.key = this.model.get('key');
        } else {
          data.issue = this.options.issue.get('key');
        }
        this.options.detailView.showActionSpinner();
        return $.ajax({
          type: 'POST',
          url: url,
          data: data
        }).done((function(_this) {
          return function() {
            return _this.options.detailView.updateAfterAction(true);
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors('msg')).join(' '));
            return _this.options.detailView.hideActionSpinner();
          };
        })(this));
      };

      return IssueDetailCommentFormView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/views/plan-form-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var $, PlanFormView;
    $ = jQuery;
    return PlanFormView = (function(_super) {
      __extends(PlanFormView, _super);

      function PlanFormView() {
        return PlanFormView.__super__.constructor.apply(this, arguments);
      }

      PlanFormView.prototype.template = Templates['plan-form'];

      PlanFormView.prototype.collectionEvents = {
        'reset': 'render'
      };

      PlanFormView.prototype.ui = {
        select: '#issue-detail-plan-select'
      };

      PlanFormView.prototype.events = {
        'click #issue-plan-cancel': 'cancel',
        'click #issue-plan-submit': 'submit'
      };

      PlanFormView.prototype.onRender = function() {
        this.ui.select.select2({
          width: '250px',
          minimumResultsForSearch: 100
        });
        return this.$('.error a').prop('href', baseUrl + '/action_plans/index/' + this.options.issue.get('project'));
      };

      PlanFormView.prototype.cancel = function() {
        return this.options.detailView.updateAfterAction(false);
      };

      PlanFormView.prototype.submit = function() {
        var plan;
        plan = this.ui.select.val();
        this.options.detailView.showActionSpinner();
        return $.ajax({
          type: 'POST',
          url: baseUrl + '/api/issues/plan',
          data: {
            issue: this.options.issue.get('key'),
            plan: plan === '#unplan' ? '' : plan
          }
        }).done((function(_this) {
          return function() {
            return _this.options.detailView.updateAfterAction(true);
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
            return _this.options.detailView.hideActionSpinner();
          };
        })(this));
      };

      PlanFormView.prototype.serializeData = function() {
        return {
          items: this.collection.toJSON(),
          issue: this.options.issue.toJSON()
        };
      };

      return PlanFormView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/views/set-severity-form-view',['backbone.marionette', 'templates/issue'], function(Marionette, Templates) {
    var $, SetSeverityFormView;
    $ = jQuery;
    return SetSeverityFormView = (function(_super) {
      __extends(SetSeverityFormView, _super);

      function SetSeverityFormView() {
        return SetSeverityFormView.__super__.constructor.apply(this, arguments);
      }

      SetSeverityFormView.prototype.template = Templates['set-severity-form'];

      SetSeverityFormView.prototype.ui = {
        select: '#issue-set-severity-select'
      };

      SetSeverityFormView.prototype.events = {
        'click #issue-set-severity-cancel': 'cancel',
        'click #issue-set-severity-submit': 'submit'
      };

      SetSeverityFormView.prototype.onRender = function() {
        var format;
        format = function(state) {
          if (!state.id) {
            return state.text;
          }
          return '<i class="icon-severity-' + state.id.toLowerCase() + '"></i> ' + state.text;
        };
        return this.ui.select.select2({
          minimumResultsForSearch: 100,
          formatResult: format,
          formatSelection: format,
          escapeMarkup: function(m) {
            return m;
          }
        });
      };

      SetSeverityFormView.prototype.cancel = function() {
        return this.options.detailView.updateAfterAction(false);
      };

      SetSeverityFormView.prototype.submit = function() {
        this.options.detailView.showActionSpinner();
        return $.ajax({
          type: 'POST',
          url: baseUrl + '/api/issues/set_severity',
          data: {
            issue: this.options.issue.get('key'),
            severity: this.ui.select.val()
          }
        }).done((function(_this) {
          return function() {
            return _this.options.detailView.updateAfterAction(true);
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
            return _this.options.detailView.hideActionSpinner();
          };
        })(this));
      };

      return SetSeverityFormView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/issue-view',['backbone.marionette', 'templates/issue', 'issue/models/rule', 'issue/views/rule-view', 'issue/models/change-log', 'issue/views/change-log-view', 'issue/collections/action-plans', 'issue/views/assign-form-view', 'issue/views/comment-form-view', 'issue/views/plan-form-view', 'issue/views/set-severity-form-view'], function(Marionette, Templates, Rule, RuleView, ChangeLog, ChangeLogView, ActionPlans, AssignFormView, CommentFormView, PlanFormView, SetSeverityFormView) {
    var $, IssueView;
    $ = jQuery;
    return IssueView = (function(_super) {
      __extends(IssueView, _super);

      function IssueView() {
        return IssueView.__super__.constructor.apply(this, arguments);
      }

      IssueView.prototype.className = 'code-issues';

      IssueView.prototype.template = Templates['issue'];

      IssueView.prototype.regions = {
        formRegion: '.code-issue-form',
        ruleRegion: '#tab-issue-rule',
        changeLogRegion: '#tab-issue-changelog'
      };

      IssueView.prototype.modelEvents = {
        'change': 'render'
      };

      IssueView.prototype.events = {
        'click': 'setDetailScope',
        'click .code-issue-toggle': 'toggleCollapsed',
        'click [href=#tab-issue-rule]': 'showRuleTab',
        'click [href=#tab-issue-changelog]': 'showChangeLogTab',
        'click #issue-comment': 'comment',
        'click .issue-comment-edit': 'editComment',
        'click .issue-comment-delete': 'deleteComment',
        'click .issue-transition': 'transition',
        'click #issue-set-severity': 'setSeverity',
        'click #issue-assign': 'assign',
        'click #issue-assign-to-me': 'assignToMe',
        'click #issue-plan': 'plan',
        'click .issue-action': 'action'
      };

      IssueView.prototype.onRender = function() {
        this.rule = new Rule({
          key: this.model.get('rule')
        });
        this.ruleRegion.show(new RuleView({
          model: this.rule,
          issue: this.model
        }));
        this.changeLog = new ChangeLog();
        return this.changeLogRegion.show(new ChangeLogView({
          collection: this.changeLog,
          issue: this.model
        }));
      };

      IssueView.prototype.setDetailScope = function() {
        return key.setScope('detail');
      };

      IssueView.prototype.setListScope = function() {
        return key.setScope('list');
      };

      IssueView.prototype.onClose = function() {
        if (this.ruleRegion) {
          return this.ruleRegion.reset();
        }
      };

      IssueView.prototype.resetIssue = function(options) {
        var key;
        this.setListScope();
        key = this.model.get('key');
        this.model.clear({
          silent: true
        });
        this.model.set({
          key: key
        }, {
          silent: true
        });
        return this.model.fetch(options).done((function(_this) {
          return function() {
            return _this.trigger('reset');
          };
        })(this));
      };

      IssueView.prototype.toggleCollapsed = function() {
        this.$('.code-issue').toggleClass('code-issue-collapsed');
        if (!this.$('.code-issue').is('.code-issue-collapsed')) {
          return this.showRuleTab();
        }
      };

      IssueView.prototype.hideTabs = function() {
        this.$('.js-tab-link').removeClass('active-link');
        return this.$('.js-tab').hide();
      };

      IssueView.prototype.showTab = function(tab) {
        var s;
        this.hideTabs();
        s = "#tab-issue-" + tab;
        this.$(s).show();
        return this.$("[href=" + s + "]").addClass('active-link');
      };

      IssueView.prototype.showRuleTab = function(e) {
        if (e != null) {
          e.preventDefault();
        }
        this.showTab('rule');
        if (!this.rule.has('name')) {
          this.$('#tab-issue-rule').addClass('navigator-fetching');
          return this.rule.fetch({
            success: (function(_this) {
              return function() {
                return _this.$('#tab-issue-rule').removeClass('navigator-fetching');
              };
            })(this)
          });
        }
      };

      IssueView.prototype.showChangeLogTab = function(e) {
        if (e != null) {
          e.preventDefault();
        }
        this.showTab('changelog');
        if (!(this.changeLog.length > 0)) {
          this.$('#tab-issue-changeLog').addClass('navigator-fetching');
          return this.changeLog.fetch({
            data: {
              issue: this.model.get('key')
            },
            success: (function(_this) {
              return function() {
                return _this.$('#tab-issue-changelog').removeClass('navigator-fetching');
              };
            })(this)
          });
        }
      };

      IssueView.prototype.showActionView = function(view) {
        this.$('.code-issue-actions').hide();
        this.$('.code-issue-form').show();
        return this.formRegion.show(view);
      };

      IssueView.prototype.showActionSpinner = function() {
        return this.$('.code-issue-actions').addClass('navigator-fetching');
      };

      IssueView.prototype.hideActionSpinner = function() {
        return this.$('.code-issue-actions').removeClass('navigator-fetching');
      };

      IssueView.prototype.updateAfterAction = function(fetch) {
        this.formRegion.reset();
        this.$('.code-issue-actions').show();
        this.$('.code-issue-form').hide();
        this.$('[data-comment-key]').show();
        if (fetch) {
          return $.when(this.resetIssue()).done((function(_this) {
            return function() {
              return _this.hideActionSpinner();
            };
          })(this));
        }
      };

      IssueView.prototype.comment = function() {
        var commentFormView;
        commentFormView = new CommentFormView({
          issue: this.model,
          detailView: this
        });
        return this.showActionView(commentFormView);
      };

      IssueView.prototype.editComment = function(e) {
        var comment, commentEl, commentFormView, commentKey;
        commentEl = $(e.target).closest('[data-comment-key]');
        commentKey = commentEl.data('comment-key');
        comment = _.findWhere(this.model.get('comments'), {
          key: commentKey
        });
        commentEl.hide();
        commentFormView = new CommentFormView({
          model: new Backbone.Model(comment),
          issue: this.model,
          detailView: this
        });
        return this.showActionView(commentFormView);
      };

      IssueView.prototype.deleteComment = function(e) {
        var commentKey, confirmMsg;
        commentKey = $(e.target).closest('[data-comment-key]').data('comment-key');
        confirmMsg = $(e.target).data('confirm-msg');
        if (confirm(confirmMsg)) {
          this.showActionSpinner();
          return $.ajax({
            type: "POST",
            url: baseUrl + "/issue/delete_comment?id=" + commentKey
          }).done((function(_this) {
            return function() {
              return _this.updateAfterAction(true);
            };
          })(this)).fail((function(_this) {
            return function(r) {
              alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
              return _this.hideActionSpinner();
            };
          })(this));
        }
      };

      IssueView.prototype.transition = function(e) {
        this.showActionSpinner();
        return $.ajax({
          type: 'POST',
          url: baseUrl + '/api/issues/do_transition',
          data: {
            issue: this.model.get('key'),
            transition: $(e.target).data('transition')
          }
        }).done((function(_this) {
          return function() {
            return _this.resetIssue();
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
            return _this.hideActionSpinner();
          };
        })(this));
      };

      IssueView.prototype.setSeverity = function() {
        var setSeverityFormView;
        setSeverityFormView = new SetSeverityFormView({
          issue: this.model,
          detailView: this
        });
        return this.showActionView(setSeverityFormView);
      };

      IssueView.prototype.assign = function() {
        var assignFormView;
        assignFormView = new AssignFormView({
          issue: this.model,
          detailView: this
        });
        return this.showActionView(assignFormView);
      };

      IssueView.prototype.assignToMe = function() {
        this.showActionSpinner();
        return $.ajax({
          type: 'POST',
          url: baseUrl + '/api/issues/assign',
          data: {
            issue: this.model.get('key'),
            me: true
          }
        }).done((function(_this) {
          return function() {
            return _this.resetIssue();
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
            return _this.hideActionSpinner();
          };
        })(this));
      };

      IssueView.prototype.plan = function() {
        var actionPlans, planFormView;
        actionPlans = new ActionPlans();
        planFormView = new PlanFormView({
          collection: actionPlans,
          issue: this.model,
          detailView: this
        });
        this.showActionSpinner();
        return actionPlans.fetch({
          reset: true,
          data: {
            project: this.model.get('project')
          },
          success: (function(_this) {
            return function() {
              _this.hideActionSpinner();
              return _this.showActionView(planFormView);
            };
          })(this)
        });
      };

      IssueView.prototype.action = function(e) {
        var actionKey;
        actionKey = $(e.target).data('action');
        this.showActionSpinner();
        return $.ajax({
          type: 'POST',
          url: baseUrl + '/api/issues/do_action',
          data: {
            issue: this.model.get('key'),
            actionKey: actionKey
          }
        }).done((function(_this) {
          return function() {
            return _this.resetIssue();
          };
        })(this)).fail((function(_this) {
          return function(r) {
            alert(_.pluck(r.responseJSON.errors, 'msg').join(' '));
            return _this.hideActionSpinner();
          };
        })(this));
      };

      IssueView.prototype.serializeData = function() {
        var componentKey, issueKey;
        componentKey = encodeURIComponent(this.model.get('component'));
        issueKey = encodeURIComponent(this.model.get('key'));
        return _.extend(IssueView.__super__.serializeData.apply(this, arguments), {
          permalink: "" + baseUrl + "/component/index#component=" + componentKey + "&currentIssue=" + issueKey
        });
      };

      return IssueView;

    })(Marionette.Layout);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('issue/models/issue',['backbone'], function(Backbone) {
    var Issue;
    return Issue = (function(_super) {
      __extends(Issue, _super);

      function Issue() {
        return Issue.__super__.constructor.apply(this, arguments);
      }

      Issue.prototype.url = function() {
        return "" + baseUrl + "/api/issues/show?key=" + (this.get('key'));
      };

      Issue.prototype.parse = function(r) {
        if (r.issue) {
          return r.issue;
        } else {
          return r;
        }
      };

      return Issue;

    })(Backbone.Model);
  });

}).call(this);

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

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/source',['backbone.marionette', 'templates/component-viewer', 'component-viewer/coverage-popup', 'component-viewer/duplication-popup', 'component-viewer/time-changes-popup', 'component-viewer/line-actions-popup', 'issue/issue-view', 'issue/models/issue', 'common/handlebars-extensions'], function(Marionette, Templates, CoveragePopupView, DuplicationPopupView, TimeChangesPopupView, LineActionsPopupView, IssueView, Issue) {
    var $, API_COVERAGE_TESTS, ISSUES_LIMIT, SourceView;
    $ = jQuery;
    API_COVERAGE_TESTS = "" + baseUrl + "/api/tests/test_cases";
    ISSUES_LIMIT = 100;
    return SourceView = (function(_super) {
      var EXPAND_LINES, HIGHLIGHTED_ROW_CLASS, LINES_AROUND_COVERED_LINE, LINES_AROUND_ISSUE;

      __extends(SourceView, _super);

      function SourceView() {
        return SourceView.__super__.constructor.apply(this, arguments);
      }

      SourceView.prototype.template = Templates['cw-source'];

      SourceView.prototype.expandTemplate = Templates['cw-code-expand'];

      LINES_AROUND_ISSUE = 4;

      LINES_AROUND_COVERED_LINE = 1;

      EXPAND_LINES = 20;

      HIGHLIGHTED_ROW_CLASS = 'row-highlighted';

      SourceView.prototype.events = {
        'click .sym': 'highlightUsages',
        'click .js-line-actions': 'highlightLine',
        'click .coverage-tests': 'showCoveragePopup',
        'click .duplication-exists': 'showDuplicationPopup',
        'mouseenter .duplication-exists': 'duplicationMouseEnter',
        'mouseleave .duplication-exists': 'duplicationMouseLeave',
        'click .js-expand': 'expandBlock',
        'click .js-expand-all': 'expandAll',
        'click .js-time-changes': 'toggleTimeChangePopup'
      };

      SourceView.prototype.initialize = function() {
        SourceView.__super__.initialize.apply(this, arguments);
        return this.showBlocks = [];
      };

      SourceView.prototype.resetShowBlocks = function() {
        this.showBlocks = [];
        return this.options.main.trigger('resetShowBlocks');
      };

      SourceView.prototype.addShowBlock = function(from, to, forceIncludeZero) {
        if (forceIncludeZero == null) {
          forceIncludeZero = false;
        }
        if (from <= 0 && !forceIncludeZero) {
          from = 1;
        }
        return this.showBlocks.push({
          from: from,
          to: to
        });
      };

      SourceView.prototype.onRender = function() {
        this.delegateEvents();
        this.showSettings = false;
        this.renderExpandButtons();
        if (this.options.main.settings.get('issues') && this.model.has('activeIssues')) {
          this.renderIssues();
        }
        return this.highlightCurrentLine();
      };

      SourceView.prototype.renderExpandButtons = function() {
        var expand, firstShown, lastShown, lines, rows;
        rows = this.$('.row[data-line-number]');
        rows.get().forEach((function(_this) {
          return function(row) {
            var expand, line, linePrev;
            line = $(row).data('line-number');
            linePrev = $(row).prev('[data-line-number]').data('line-number');
            if ((line != null) && (linePrev != null) && (linePrev + 1) < line) {
              expand = _this.expandTemplate({
                from: linePrev,
                to: line,
                settings: _this.options.main.settings.toJSON()
              });
              return $(expand).insertBefore($(row));
            }
          };
        })(this));
        firstShown = rows.first().data('line-number');
        if (firstShown > 1) {
          expand = this.expandTemplate({
            from: firstShown - EXPAND_LINES,
            to: firstShown,
            settings: this.options.main.settings.toJSON()
          });
          $(expand).insertBefore(rows.first());
        }
        lines = _.size(this.model.get('source'));
        lastShown = rows.last().data('line-number');
        if (lastShown < lines) {
          expand = this.expandTemplate({
            from: lastShown,
            to: lines,
            settings: this.options.main.settings.toJSON()
          });
          $(expand).insertAfter(rows.last());
        }
        return this.delegateEvents();
      };

      SourceView.prototype.renderIssues = function() {
        var issues, rendered;
        issues = this.model.get('activeIssues');
        issues = _.sortBy(issues, 'line');
        rendered = 0;
        return issues.forEach((function(_this) {
          return function(issue) {
            var container, issueModel, issueView, line, row;
            line = issue.line || 0;
            if (issue.status === 'CLOSED') {
              line = 0;
            }
            row = _this.$("#" + _this.cid + "-" + line);
            if (!(row.length > 0)) {
              line = 0;
              row = _this.$("#" + _this.cid + "-" + line);
            }
            if (row.length > 0) {
              rendered += 1;
              row.removeClass('row-hidden');
              container = row.children('.line');
              if (line > 0) {
                container.addClass('issue');
              }
              if (rendered < ISSUES_LIMIT) {
                issueModel = new Issue(issue);
                issueView = new IssueView({
                  model: issueModel
                });
                issueView.render().$el.appendTo(container);
                return issueView.on('reset', function() {
                  _this.updateIssue(issueModel);
                  return _this.options.main.requestComponent(_this.options.main.key, false, false).done(function() {
                    _this.options.main.headerView.silentUpdate = true;
                    return _this.options.main.headerView.render();
                  });
                });
              } else {
                return row.prop('title', tp('component_viewer.issues_limit_reached_tooltip', issue.message));
              }
            }
          };
        })(this));
      };

      SourceView.prototype.updateIssue = function(issueModel) {
        var issues;
        issues = this.model.get('issues');
        issues = _.reject(issues, function(issue) {
          return issue.key === issueModel.get('key');
        });
        issues.push(issueModel.toJSON());
        this.model.set('issues', issues);
        issues = this.model.get('activeIssues');
        issues = _.reject(issues, function(issue) {
          return issue.key === issueModel.get('key');
        });
        issues.push(issueModel.toJSON());
        return this.model.set('activeIssues', issues);
      };

      SourceView.prototype.showSpinner = function() {
        return this.$el.html('<div style="padding: 10px;"><i class="spinner"></i></div>');
      };

      SourceView.prototype.showLineActionsPopup = function(e) {
        var popup;
        e.stopPropagation();
        $('body').click();
        popup = new LineActionsPopupView({
          triggerEl: $(e.currentTarget),
          main: this.options.main,
          row: $(e.currentTarget).closest('.row')
        });
        return popup.render();
      };

      SourceView.prototype.highlightLine = function(e) {
        var highlighted, row;
        row = $(e.currentTarget).closest('.row');
        highlighted = row.is("." + HIGHLIGHTED_ROW_CLASS);
        this.$("." + HIGHLIGHTED_ROW_CLASS).removeClass(HIGHLIGHTED_ROW_CLASS);
        this.highlightedLine = null;
        if (!highlighted) {
          row.addClass(HIGHLIGHTED_ROW_CLASS);
          this.highlightedLine = row.data('line-number');
          return this.showLineActionsPopup(e);
        }
      };

      SourceView.prototype.highlightCurrentLine = function() {
        if (this.highlightedLine != null) {
          return this.$("[data-line-number=" + this.highlightedLine + "]").addClass(HIGHLIGHTED_ROW_CLASS);
        }
      };

      SourceView.prototype.highlightUsages = function(e) {
        var highlighted, key;
        highlighted = $(e.currentTarget).is('.highlighted');
        key = e.currentTarget.className.split(/\s+/)[0];
        this.$('.sym.highlighted').removeClass('highlighted');
        if (!highlighted) {
          return this.$(".sym." + key).addClass('highlighted');
        }
      };

      SourceView.prototype.toggleSettings = function() {
        this.$('.settings-toggle button').toggleClass('open');
        return this.$('.component-viewer-source-settings').toggleClass('open');
      };

      SourceView.prototype.toggleMeasures = function(e) {
        var row;
        row = $(e.currentTarget).closest('.component-viewer-header');
        return row.toggleClass('component-viewer-header-full');
      };

      SourceView.prototype.showCoveragePopup = function(e) {
        var line;
        e.stopPropagation();
        $('body').click();
        line = $(e.currentTarget).closest('.row').data('line-number');
        return $.get(API_COVERAGE_TESTS, {
          key: this.options.main.component.get('key'),
          line: line
        }, (function(_this) {
          return function(data) {
            var popup;
            popup = new CoveragePopupView({
              model: new Backbone.Model(data),
              triggerEl: $(e.currentTarget),
              main: _this.options.main
            });
            return popup.render();
          };
        })(this));
      };

      SourceView.prototype.showDuplicationPopup = function(e) {
        var blocks, index, line, popup;
        e.stopPropagation();
        $('body').click();
        index = $(e.currentTarget).data('index');
        line = $(e.currentTarget).closest('[data-line-number]').data('line-number');
        blocks = this.model.get('duplications')[index - 1].blocks;
        blocks = _.filter(blocks, function(b) {
          return (b._ref !== '1') || (b._ref === '1' && b.from > line) || (b._ref === '1' && b.from + b.size < line);
        });
        popup = new DuplicationPopupView({
          triggerEl: $(e.currentTarget),
          main: this.options.main,
          collection: new Backbone.Collection(blocks)
        });
        return popup.render();
      };

      SourceView.prototype.duplicationMouseEnter = function(e) {
        return this.toggleDuplicationHover(e, true);
      };

      SourceView.prototype.duplicationMouseLeave = function(e) {
        return this.toggleDuplicationHover(e, false);
      };

      SourceView.prototype.toggleDuplicationHover = function(e, add) {
        var bar, index;
        bar = $(e.currentTarget);
        index = bar.parent().children('.duplication').index(bar);
        return this.$('.duplications').each(function() {
          return $(".duplication", this).eq(index).filter('.duplication-exists').toggleClass('duplication-hover', add);
        });
      };

      SourceView.prototype.expandBlock = function(e) {
        var linesFrom, linesTo;
        linesFrom = $(e.currentTarget).data('from');
        linesTo = $(e.currentTarget).data('to');
        if (linesTo === _.size(this.model.get('source'))) {
          if (linesTo - linesFrom > EXPAND_LINES) {
            linesTo = linesFrom + EXPAND_LINES;
          }
        }
        if (linesFrom === 0 && linesTo > EXPAND_LINES) {
          linesFrom = linesTo - EXPAND_LINES;
        }
        this.showBlocks.push({
          from: linesFrom,
          to: linesTo
        });
        return this.render();
      };

      SourceView.prototype.expandAll = function() {
        return this.options.main.showAllLines();
      };

      SourceView.prototype.getSCMForLine = function(lineNumber) {
        var closest, closestIndex, scm;
        scm = this.model.get('scm') || [];
        closest = -1;
        closestIndex = -1;
        scm.forEach(function(s, i) {
          var line;
          line = s[0];
          if (line <= lineNumber && line > closest) {
            closest = line;
            return closestIndex = i;
          }
        });
        if (closestIndex !== -1) {
          return scm[closestIndex];
        } else {
          return null;
        }
      };

      SourceView.prototype.augmentWithSCM = function(source) {
        var scm;
        scm = this.model.get('scm') || [];
        scm.forEach(function(s) {
          var line;
          line = _.findWhere(source, {
            lineNumber: s[0]
          });
          return line.scm = {
            author: s[1],
            date: s[2]
          };
        });
        this.showBlocks.forEach((function(_this) {
          return function(block) {
            var line, scmForLine;
            scmForLine = _this.getSCMForLine(block.from);
            if (scmForLine != null) {
              line = _.findWhere(source, {
                lineNumber: block.from
              });
              return line.scm = {
                author: scmForLine[1],
                date: scmForLine[2]
              };
            }
          };
        })(this));
        return source;
      };

      SourceView.prototype.augmentWithShow = function(source) {
        source.forEach((function(_this) {
          return function(sourceLine) {
            var line, show;
            show = false;
            line = sourceLine.lineNumber;
            _this.showBlocks.forEach(function(block) {
              if (block.from <= line && block.to >= line) {
                return show = true;
              }
            });
            return _.extend(sourceLine, {
              show: show
            });
          };
        })(this));
        return source;
      };

      SourceView.prototype.prepareSource = function() {
        var source;
        source = this.model.get('formattedSource');
        if (source != null) {
          return this.augmentWithShow(source);
        }
      };

      SourceView.prototype.getStatColumnsCount = function() {
        var count;
        count = 1;
        if (this.options.main.settings.get('coverage')) {
          count += 2;
        }
        if (this.options.main.settings.get('duplications')) {
          count += 1;
        }
        if (this.options.main.settings.get('issues')) {
          count += 1;
        }
        return count;
      };

      SourceView.prototype.showZeroLine = function() {
        var r;
        r = false;
        if (!this.options.main.state.get('hasSource')) {
          r = true;
        }
        this.showBlocks.forEach(function(block) {
          if (block.from <= 0) {
            return r = true;
          }
        });
        return r;
      };

      SourceView.prototype.serializeData = function() {
        var _ref;
        return {
          uid: this.cid,
          source: this.prepareSource(),
          settings: this.options.main.settings.toJSON(),
          state: this.options.main.state.toJSON(),
          showSettings: this.showSettings,
          component: this.options.main.component.toJSON(),
          columns: this.getStatColumnsCount() + 1,
          showZeroLine: this.showZeroLine(),
          issuesLimit: ISSUES_LIMIT,
          issuesLimitReached: ((_ref = this.model.get('activeIssues')) != null ? _ref.length : void 0) > ISSUES_LIMIT
        };
      };

      return SourceView;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/base-header',['backbone.marionette'], function(Marionette) {
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.initialize = function(options) {
        _Class.__super__.initialize.apply(this, arguments);
        this.main = options.main;
        this.state = options.state;
        this.component = options.component;
        this.settings = options.settings;
        this.source = options.source;
        return this.header = options.header;
      };

      _Class.prototype.serializeData = function() {
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          state: this.state.toJSON(),
          component: this.component.toJSON(),
          settings: this.settings.toJSON(),
          periods: this.main.periods.toJSON()
        });
      };

      return _Class;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/basic-header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/base-header'], function(Marionette, Templates, BaseHeaderView) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-basic-header'];

      _Class.prototype.events = {
        'click .js-filter-lines': 'filterByLines',
        'click .js-filter-ncloc': 'filterByNcloc'
      };

      _Class.prototype.filterByLines = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByLines');
        return this.state.set('activeHeaderItem', '.js-filter-lines');
      };

      _Class.prototype.filterByNcloc = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByNcloc');
        return this.state.set('activeHeaderItem', '.js-filter-ncloc');
      };

      return _Class;

    })(BaseHeaderView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/issues-header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/base-header', 'component-viewer/time-changes-popup'], function(Marionette, Templates, BaseHeaderView, TimeChangesPopupView) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-issues-header'];

      _Class.prototype.events = {
        'click .js-issues-bulk-change': 'issuesBulkChange',
        'click .js-issues-time-changes': 'issuesTimeChanges',
        'click .js-filter-current-issue': 'filterByCurrentIssue',
        'click .js-filter-all-issues': 'filterByAllIssues',
        'click .js-filter-rule': 'filterByRule',
        'click .js-filter-fixed-issues': 'filterByFixedIssues',
        'click .js-filter-unresolved-issues': 'filterByUnresolvedIssues',
        'click .js-filter-false-positive-issues': 'filterByFalsePositiveIssues',
        'click .js-filter-open-issues': 'filterByOpenIssues',
        'click .js-filter-BLOCKER-issues': 'filterByBlockerIssues',
        'click .js-filter-CRITICAL-issues': 'filterByCriticalIssues',
        'click .js-filter-MAJOR-issues': 'filterByMajorIssues',
        'click .js-filter-MINOR-issues': 'filterByMinorIssues',
        'click .js-filter-INFO-issues': 'filterByInfoIssues'
      };

      _Class.prototype.initialize = function(options) {
        _Class.__super__.initialize.apply(this, arguments);
        return window.onBulkIssues = (function(_this) {
          return function() {
            $('#modal').dialog('close');
            return options.main.requestIssues(options.main.key).done(function() {
              return options.main.render();
            });
          };
        })(this);
      };

      _Class.prototype.issuesBulkChange = function() {
        var count, issues, url, _ref;
        issues = (_ref = this.source.get('activeIssues')) != null ? _ref.map(function(issue) {
          return issue.key;
        }) : void 0;
        if (issues.length > 0) {
          count = Math.min(issues.length, 200);
          url = "" + baseUrl + "/issues/bulk_change_form?issues=" + (_.first(issues, count).join());
          return openModalWindow(url, {});
        }
      };

      _Class.prototype.issuesTimeChanges = function(e) {
        var popup;
        e.stopPropagation();
        $('body').click();
        popup = new TimeChangesPopupView({
          triggerEl: $(e.currentTarget),
          main: this.options.main,
          bottom: true,
          prefix: t('component_viewer.added')
        });
        popup.render();
        return popup.on('change', (function(_this) {
          return function(period) {
            return _this.main.enablePeriod(period, '.js-filter-unresolved-issues');
          };
        })(this));
      };

      _Class.prototype.filterByCurrentIssue = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByCurrentIssue');
        return this.state.set('activeHeaderItem', '.js-filter-current-issues');
      };

      _Class.prototype.filterByAllIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByAllIssues');
        return this.state.set('activeHeaderItem', '.js-filter-all-issues');
      };

      _Class.prototype.filterByFixedIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByFixedIssues');
        return this.state.set('activeHeaderItem', '.js-filter-fixed-issues');
      };

      _Class.prototype.filterByUnresolvedIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUnresolvedIssues');
        return this.state.set('activeHeaderItem', '.js-filter-unresolved-issues');
      };

      _Class.prototype.filterByFalsePositiveIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByFalsePositiveIssues');
        return this.state.set('activeHeaderItem', '.js-filter-false-positive-issues');
      };

      _Class.prototype.filterByOpenIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByOpenIssues');
        return this.state.set('activeHeaderItem', '.js-filter-open-issues');
      };

      _Class.prototype.filterByRule = function(e) {
        var rule;
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        rule = $(e.currentTarget).data('rule');
        this.header.filterLines(e, 'filterByRule', rule);
        this.state.set('activeHeaderItem', ".js-filter-rule[data-rule='" + rule + "']");
        return setTimeout(((function(_this) {
          return function() {
            return _this.scrollToRule(rule);
          };
        })(this)), 0);
      };

      _Class.prototype.filterByBlockerIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByBlockerIssues');
        return this.state.set('activeHeaderItem', '.js-filter-BLOCKER-issues');
      };

      _Class.prototype.filterByCriticalIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByCriticalIssues');
        return this.state.set('activeHeaderItem', '.js-filter-CRITICAL-issues');
      };

      _Class.prototype.filterByMajorIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByMajorIssues');
        return this.state.set('activeHeaderItem', '.js-filter-MAJOR-issues');
      };

      _Class.prototype.filterByMinorIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByMinorIssues');
        return this.state.set('activeHeaderItem', '.js-filter-MINOR-issues');
      };

      _Class.prototype.filterByInfoIssues = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByInfoIssues');
        return this.state.set('activeHeaderItem', '.js-filter-INFO-issues');
      };

      _Class.prototype.scrollToRule = function(rule) {
        var container, ruleEl, topOffset;
        ruleEl = this.$('.js-filter-rule').filter("[data-rule=\"" + rule + "\"]");
        container = ruleEl.closest('.component-viewer-header-expanded-bar-section-list');
        topOffset = ruleEl.offset().top - container.offset().top;
        if (topOffset > container.height()) {
          return container.scrollTop(topOffset);
        }
      };

      _Class.prototype.serializeData = function() {
        var _ref, _ref1, _ref2;
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          period: (_ref = this.state.get('period')) != null ? _ref.toJSON() : void 0,
          hasIssues: ((_ref1 = this.state.get('severities')) != null ? _ref1.length : void 0) || ((_ref2 = this.state.get('rules')) != null ? _ref2.length : void 0)
        });
      };

      return _Class;

    })(BaseHeaderView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/coverage-header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/base-header', 'component-viewer/time-changes-popup'], function(Marionette, Templates, BaseHeaderView, TimeChangesPopupView) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-coverage-header'];

      _Class.prototype.events = {
        'click .js-coverage-time-changes': 'coverageTimeChanges',
        'click .js-filter-lines-to-cover': 'filterByLinesToCover',
        'click .js-filter-uncovered-lines': 'filterByUncoveredLines',
        'click .js-filter-branches-to-cover': 'filterByBranchesToCover',
        'click .js-filter-uncovered-branches': 'filterByUncoveredBranches',
        'click .js-filter-lines-to-cover-it': 'filterByLinesToCoverIT',
        'click .js-filter-uncovered-lines-it': 'filterByUncoveredLinesIT',
        'click .js-filter-branches-to-cover-it': 'filterByBranchesToCoverIT',
        'click .js-filter-uncovered-branches-it': 'filterByUncoveredBranchesIT',
        'click .js-filter-lines-to-cover-overall': 'filterByLinesToCoverOverall',
        'click .js-filter-uncovered-lines-overall': 'filterByUncoveredLinesOverall',
        'click .js-filter-branches-to-cover-overall': 'filterByBranchesToCoverOverall',
        'click .js-filter-uncovered-branches-overall': 'filterByUncoveredBranchesOverall'
      };

      _Class.prototype.coverageTimeChanges = function(e) {
        var popup;
        e.stopPropagation();
        $('body').click();
        popup = new TimeChangesPopupView({
          triggerEl: $(e.currentTarget),
          main: this.options.main,
          bottom: true
        });
        popup.render();
        return popup.on('change', (function(_this) {
          return function(period) {
            return _this.main.enablePeriod(period, '.js-filter-lines-to-cover');
          };
        })(this));
      };

      _Class.prototype.filterByLinesToCover = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByLinesToCover');
        return this.state.set('activeHeaderItem', '.js-filter-lines-to-cover');
      };

      _Class.prototype.filterByUncoveredLines = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUncoveredLines');
        return this.state.set('activeHeaderItem', '.js-filter-uncovered-lines');
      };

      _Class.prototype.filterByBranchesToCover = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByBranchesToCover');
        return this.state.set('activeHeaderItem', '.js-filter-branches-to-cover');
      };

      _Class.prototype.filterByUncoveredBranches = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUncoveredBranches');
        return this.state.set('activeHeaderItem', '.js-filter-uncovered-branches');
      };

      _Class.prototype.filterByLinesToCoverIT = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByLinesToCoverIT');
        return this.state.set('activeHeaderItem', '.js-filter-lines-to-cover-it');
      };

      _Class.prototype.filterByUncoveredLinesIT = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUncoveredLinesIT');
        return this.state.set('activeHeaderItem', '.js-filter-uncovered-lines-it');
      };

      _Class.prototype.filterByBranchesToCoverIT = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByBranchesToCoverIT');
        return this.state.set('activeHeaderItem', '.js-filter-branches-to-cover-it');
      };

      _Class.prototype.filterByUncoveredBranchesIT = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUncoveredBranchesIT');
        return this.state.set('activeHeaderItem', '.js-filter-uncovered-branches-it');
      };

      _Class.prototype.filterByLinesToCoverOverall = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByLinesToCoverOverall');
        return this.state.set('activeHeaderItem', '.js-filter-lines-to-cover-overall');
      };

      _Class.prototype.filterByUncoveredLinesOverall = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUncoveredLinesOverall');
        return this.state.set('activeHeaderItem', '.js-filter-uncovered-lines-overall');
      };

      _Class.prototype.filterByBranchesToCoverOverall = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByBranchesToCoverOverall');
        return this.state.set('activeHeaderItem', '.js-filter-branches-to-cover-overall');
      };

      _Class.prototype.filterByUncoveredBranchesOverall = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByUncoveredBranchesOverall');
        return this.state.set('activeHeaderItem', '.js-filter-uncovered-branches-overall');
      };

      _Class.prototype.serializeData = function() {
        var _ref;
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          period: (_ref = this.state.get('period')) != null ? _ref.toJSON() : void 0
        });
      };

      return _Class;

    })(BaseHeaderView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/duplications-header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/base-header'], function(Marionette, Templates, BaseHeaderView) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-duplications-header'];

      _Class.prototype.events = {
        'click .js-filter-duplications': 'filterByDuplications'
      };

      _Class.prototype.filterByDuplications = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterByDuplications');
        return this.state.set('activeHeaderItem', '.js-filter-duplications');
      };

      return _Class;

    })(BaseHeaderView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/scm-header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/base-header', 'component-viewer/time-changes-popup'], function(Marionette, Templates, BaseHeaderView, TimeChangesPopupView) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-scm-header'];

      _Class.prototype.events = {
        'click .js-scm-time-changes': 'scmTimeChanges',
        'click .js-filter-modified-lines': 'filterBySCM'
      };

      _Class.prototype.scmTimeChanges = function(e) {
        var popup;
        e.stopPropagation();
        $('body').click();
        popup = new TimeChangesPopupView({
          triggerEl: $(e.currentTarget),
          main: this.options.main,
          bottom: true
        });
        popup.render();
        return popup.on('change', (function(_this) {
          return function(period) {
            return _this.main.enablePeriod(period, '.js-filter-modified-lines');
          };
        })(this));
      };

      _Class.prototype.filterBySCM = function(e) {
        if ($(e.currentTarget).is('.active')) {
          return this.header.unsetFilter();
        }
        this.header.filterLines(e, 'filterBySCM');
        return this.state.set('activeHeaderItem', '.js-filter-modified-lines');
      };

      _Class.prototype.serializeData = function() {
        var _ref;
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          period: (_ref = this.state.get('period')) != null ? _ref.toJSON() : void 0
        });
      };

      return _Class;

    })(BaseHeaderView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/covered-files-popup',['backbone.marionette', 'templates/component-viewer', 'common/popup', 'component-viewer/utils'], function(Marionette, Templates, Popup, utils) {
    var $, CoveredFilesPopupView;
    $ = jQuery;
    return CoveredFilesPopupView = (function(_super) {
      __extends(CoveredFilesPopupView, _super);

      function CoveredFilesPopupView() {
        return CoveredFilesPopupView.__super__.constructor.apply(this, arguments);
      }

      CoveredFilesPopupView.prototype.template = Templates['cw-covered-files-popup'];

      CoveredFilesPopupView.prototype.events = {
        'click a[data-key]': 'goToFile'
      };

      CoveredFilesPopupView.prototype.goToFile = function(e) {
        var files, key;
        key = $(e.currentTarget).data('key');
        files = this.collection.toJSON();
        this.options.main.addTransition('covers', _.map(files, function(file) {
          var x;
          x = utils.splitLongName(file.longName);
          return {
            key: file.key,
            name: x.name,
            subname: x.dir,
            active: file.key === key
          };
        }));
        return this.options.main._open(key);
      };

      CoveredFilesPopupView.prototype.serializeData = function() {
        var items, sortedItems;
        items = this.collection.toJSON().map(function(file) {
          return _.extend(file, utils.splitLongName(file.longName));
        });
        sortedItems = _.sortBy(items, 'name');
        return {
          items: sortedItems,
          test: this.options.test
        };
      };

      return CoveredFilesPopupView;

    })(Popup);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/tests-header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/base-header', 'component-viewer/covered-files-popup'], function(Marionette, Templates, BaseHeaderView, CoveredFilesPopupView) {
    var $, API_TESTS_COVERED_FILES;
    $ = jQuery;
    API_TESTS_COVERED_FILES = "" + baseUrl + "/api/tests/covered_files";
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-tests-header'];

      _Class.prototype.ui = {
        unitTests: '.js-unit-test'
      };

      _Class.prototype.events = {
        'click @ui.unitTests': 'showCoveredFiles',
        'click .js-sort-tests-duration': 'sortTestsByDuration',
        'click .js-sort-tests-name': 'sortTestsByName'
      };

      _Class.prototype.initialize = function() {
        _Class.__super__.initialize.apply(this, arguments);
        this.tests = _.sortBy(this.component.get('tests'), 'name');
        return this.activeSort = '.js-sort-tests-name';
      };

      _Class.prototype.onRender = function() {
        this.header.enableUnitTest = (function(_this) {
          return function(testName) {
            var container, test, topOffset;
            test = _this.ui.unitTests.filter("[data-name=" + testName + "]");
            container = test.closest('.component-viewer-header-expanded-bar-section-list');
            topOffset = test.offset().top - container.offset().top;
            if (topOffset > container.height()) {
              container.scrollTop(topOffset);
            }
            return test.click();
          };
        })(this);
        if (this.activeSort) {
          return this.$(this.activeSort).addClass('active-link');
        }
      };

      _Class.prototype.onClose = function() {
        return delete this.header.enableUnitTest;
      };

      _Class.prototype.showCoveredFiles = function(e) {
        var key, test, testName;
        e.stopPropagation();
        $('body').click();
        testName = $(e.currentTarget).data('name');
        test = _.findWhere(this.component.get('tests'), {
          name: testName
        });
        key = this.component.get('key');
        return $.get(API_TESTS_COVERED_FILES, {
          key: key,
          test: testName
        }, (function(_this) {
          return function(data) {
            var popup;
            popup = new CoveredFilesPopupView({
              triggerEl: $(e.currentTarget),
              collection: new Backbone.Collection(data.files),
              test: test,
              main: _this.main
            });
            return popup.render();
          };
        })(this));
      };

      _Class.prototype.sortTestsByDuration = function() {
        this.activeSort = '.js-sort-tests-duration';
        this.tests = _.sortBy(this.tests, 'durationInMs');
        return this.render();
      };

      _Class.prototype.sortTestsByName = function() {
        this.activeSort = '.js-sort-tests-name';
        this.tests = _.sortBy(this.tests, 'name');
        return this.render();
      };

      _Class.prototype.hasCoveragePerTestData = function() {
        var hasData;
        hasData = false;
        this.component.get('tests').forEach(function(test) {
          if (test.coveredLines) {
            return hasData = true;
          }
        });
        return hasData;
      };

      _Class.prototype.serializeData = function() {
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          tests: this.tests,
          hasCoveragePerTestData: this.hasCoveragePerTestData()
        });
      };

      return _Class;

    })(BaseHeaderView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header/more-actions',['backbone.marionette', 'templates/component-viewer'], function(Marionette, Templates) {
    var $;
    $ = jQuery;
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.className = 'component-viewer-header-more-actions';

      _Class.prototype.template = Templates['cw-more-actions'];

      _Class.prototype.events = {
        'click .js-new-window': 'openNewWindow',
        'click .js-full-source': 'showFullSource',
        'click .js-raw-source': 'showRawSource',
        'click .js-extension': 'showExtension'
      };

      _Class.prototype.onRender = function() {
        return $('body').on('click.component-viewer-more-actions', (function(_this) {
          return function() {
            $('body').off('click.component-viewer-more-actions');
            return _this.close();
          };
        })(this));
      };

      _Class.prototype.openNewWindow = function() {
        return this.options.main.headerView.getPermalink();
      };

      _Class.prototype.showFullSource = function() {
        return this.options.main.showAllLines();
      };

      _Class.prototype.showRawSource = function() {
        return this.options.main.showRawSources();
      };

      _Class.prototype.showExtension = function(e) {
        var key;
        key = $(e.currentTarget).data('key');
        return this.options.main.headerView.showExtension(key);
      };

      _Class.prototype.serializeData = function() {
        return _.extend(_Class.__super__.serializeData.apply(this, arguments), {
          state: this.options.main.state.toJSON()
        });
      };

      return _Class;

    })(Marionette.ItemView);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/header',['backbone.marionette', 'templates/component-viewer', 'component-viewer/header/basic-header', 'component-viewer/header/issues-header', 'component-viewer/header/coverage-header', 'component-viewer/header/duplications-header', 'component-viewer/header/scm-header', 'component-viewer/header/tests-header', 'component-viewer/header/more-actions', 'common/handlebars-extensions'], function(Marionette, Templates, BasicHeaderView, IssuesHeaderView, CoverageHeaderView, DuplicationsHeaderView, SCMHeaderView, TestsHeaderView, MoreActionsView) {
    var $, API_EXTENSION, API_FAVORITE, BARS;
    $ = jQuery;
    API_FAVORITE = "" + baseUrl + "/api/favourites";
    API_EXTENSION = "" + baseUrl + "/resource/extension";
    BARS = [
      {
        scope: 'basic',
        view: BasicHeaderView
      }, {
        scope: 'issues',
        view: IssuesHeaderView
      }, {
        scope: 'coverage',
        view: CoverageHeaderView
      }, {
        scope: 'duplications',
        view: DuplicationsHeaderView
      }, {
        scope: 'scm',
        view: SCMHeaderView
      }, {
        scope: 'tests',
        view: TestsHeaderView
      }
    ];
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.template = Templates['cw-header'];

      _Class.prototype.regions = {
        barRegion: '.component-viewer-header-expanded-bar'
      };

      _Class.prototype.ui = {
        expandLinks: '.component-viewer-header-measures-expand',
        expandedBar: '.component-viewer-header-expanded-bar',
        spinnerBar: '.component-viewer-header-expanded-bar[data-scope=spinner]',
        unitTests: '.js-unit-test'
      };

      _Class.prototype.events = {
        'click .js-favorite': 'toggleFavorite',
        'click .js-actions': 'showMoreActions',
        'click .js-extension-close': 'closeExtension',
        'click .js-permalink': 'getPermalink',
        'click @ui.expandLinks': 'showExpandedBar',
        'click .js-toggle-issues': 'toggleIssues',
        'click .js-toggle-coverage': 'toggleCoverage',
        'click .js-toggle-duplications': 'toggleDuplications',
        'click .js-toggle-scm': 'toggleSCM'
      };

      _Class.prototype.initialize = function(options) {
        options.main.settings.on('change', (function(_this) {
          return function() {
            return _this.changeSettings();
          };
        })(this));
        this.state = options.main.state;
        this.component = options.main.component;
        return this.settings = options.main.component;
      };

      _Class.prototype.onRender = function() {
        var activeHeaderItem, activeHeaderTab;
        this.delegateEvents();
        activeHeaderTab = this.state.get('activeHeaderTab');
        activeHeaderItem = this.state.get('activeHeaderItem');
        if (activeHeaderTab) {
          if (_.findWhere(BARS, {
            scope: activeHeaderTab
          }) != null) {
            this.enableBar(activeHeaderTab).done((function(_this) {
              return function() {
                if (activeHeaderItem) {
                  return _this.enableBarItem(activeHeaderItem, _this.silentUpdate);
                }
              };
            })(this));
          } else {
            this.showExtension(activeHeaderTab);
          }
        }
        return this.silentUpdate = false;
      };

      _Class.prototype.toggleFavorite = function() {
        var component;
        component = this.component;
        if (component.get('fav')) {
          return $.ajax({
            url: "" + API_FAVORITE + "/" + (component.get('key')),
            type: 'DELETE'
          }).done((function(_this) {
            return function() {
              component.set('fav', false);
              return _this.render();
            };
          })(this));
        } else {
          return $.ajax({
            url: API_FAVORITE,
            type: 'POST',
            data: {
              key: component.get('key')
            }
          }).done((function(_this) {
            return function() {
              component.set('fav', true);
              return _this.render();
            };
          })(this));
        }
      };

      _Class.prototype.showMoreActions = function(e) {
        var view;
        e.stopPropagation();
        $('body').click();
        view = new MoreActionsView({
          main: this.options.main
        });
        return view.render().$el.appendTo(this.$el);
      };

      _Class.prototype.showExtension = function(key) {
        var bar;
        bar = this.ui.expandedBar;
        bar.html('<i class="spinner spinner-margin"></i>').addClass('active');
        this.ui.expandLinks.removeClass('active');
        return $.get(API_EXTENSION, {
          id: this.options.main.component.get('key'),
          tab: key
        }, (function(_this) {
          return function(r) {
            return bar.html(r);
          };
        })(this));
      };

      _Class.prototype.closeExtension = function(e) {
        e.preventDefault();
        return this.ui.expandedBar.html('').removeClass('active');
      };

      _Class.prototype.showBarSpinner = function() {
        return this.ui.spinnerBar.addClass('active');
      };

      _Class.prototype.hideBarSpinner = function() {
        return this.ui.spinnerBar.removeClass('active');
      };

      _Class.prototype.resetBars = function() {
        this.state.set('activeHeaderTab', null);
        this.ui.expandLinks.removeClass('active');
        this.ui.expandedBar.removeClass('active');
        this.barRegion.reset();
        return this.options.main.fitIntoElement();
      };

      _Class.prototype.enableBar = function(scope) {
        var requests;
        this.ui.expandedBar.html('<i class="spinner spinner-margin"></i>').addClass('active');
        requests = [];
        if (!this.state.get('hasMeasures')) {
          requests.push(this.options.main.requestMeasures(this.options.main.key));
        }
        if (this.component.get('isUnitTest') && !this.state.get('hasTests')) {
          requests.push(this.options.main.requestTests(this.options.main.key));
        }
        return $.when.apply($, requests).done((function(_this) {
          return function() {
            var bar;
            _this.state.set('activeHeaderTab', scope);
            bar = _.findWhere(BARS, {
              scope: scope
            });
            _this.barRegion.show(new bar.view({
              main: _this.options.main,
              state: _this.state,
              component: _this.component,
              settings: _this.settings,
              source: _this.model,
              header: _this
            }));
            _this.ui.expandedBar.addClass('active');
            _this.ui.expandLinks.filter("[data-scope=" + scope + "]").addClass('active');
            return _this.options.main.fitIntoElement();
          };
        })(this));
      };

      _Class.prototype.enableBarItem = function(item, silent) {
        var $item;
        if (silent == null) {
          silent = false;
        }
        $item = this.$(item);
        if ($item.length > 0) {
          if (silent) {
            return this.$(item).addClass('active');
          } else {
            return this.$(item).click();
          }
        } else {
          return this.options.main.hideAllLines();
        }
      };

      _Class.prototype.showExpandedBar = function(e) {
        var active, el, scope;
        el = $(e.currentTarget);
        active = el.is('.active');
        this.resetBars();
        if (!active) {
          el.addClass('active');
          scope = el.data('scope');
          return this.enableBar(scope).done((function(_this) {
            return function() {
              if (scope === 'issues') {
                _this.$('.js-filter-unresolved-issues').click();
              }
              if (scope === 'coverage') {
                _this.$('.js-filter-lines-to-cover').click();
              }
              if (scope === 'duplications') {
                _this.$('.js-filter-duplications').click();
              }
              if (scope === 'scm') {
                return _this.$('.js-filter-modified-lines').click();
              }
            };
          })(this));
        }
      };

      _Class.prototype.changeSettings = function() {
        this.$('.js-toggle-issues').toggleClass('active', this.options.main.settings.get('issues'));
        this.$('.js-toggle-coverage').toggleClass('active', this.options.main.settings.get('coverage'));
        this.$('.js-toggle-duplications').toggleClass('active', this.options.main.settings.get('duplications'));
        return this.$('.js-toggle-scm').toggleClass('active', this.options.main.settings.get('scm'));
      };

      _Class.prototype.toggleSetting = function(e, show, hide) {
        var active;
        this.showBlocks = [];
        active = $(e.currentTarget).is('.active');
        if (active) {
          return hide.call(this.options.main, true);
        } else {
          return show.call(this.options.main, true);
        }
      };

      _Class.prototype.toggleIssues = function(e) {
        return this.toggleSetting(e, this.options.main.showIssues, this.options.main.hideIssues);
      };

      _Class.prototype.toggleCoverage = function(e) {
        return this.toggleSetting(e, this.options.main.showCoverage, this.options.main.hideCoverage);
      };

      _Class.prototype.toggleDuplications = function(e) {
        return this.toggleSetting(e, this.options.main.showDuplications, this.options.main.hideDuplications);
      };

      _Class.prototype.toggleSCM = function(e) {
        return this.toggleSetting(e, this.options.main.showSCM, this.options.main.hideSCM);
      };

      _Class.prototype.toggleWorkspace = function(e) {
        return this.toggleSetting(e, this.options.main.showWorkspace, this.options.main.hideWorkspace);
      };

      _Class.prototype.showTimeChangesSpinner = function() {
        return this.$('.component-viewer-header-time-changes').html('<i class="spinner spinner-margin"></i>');
      };

      _Class.prototype.unsetFilter = function() {
        this.options.main.resetIssues();
        this.options.main.showAllLines();
        this.state.unset('activeHeaderItem');
        this.$('.item.active').removeClass('active');
        return this.render();
      };

      _Class.prototype.filterLines = function(e, methodName, extra) {
        var method;
        this.$('.component-viewer-header-expanded-bar-section-list .active').removeClass('active');
        $(e.currentTarget).addClass('active');
        method = this.options.main[methodName];
        return method.call(this.options.main, extra);
      };

      _Class.prototype.serializeShowBlocks = function() {
        var blocks;
        blocks = this.options.main.sourceView.showBlocks.map(function(b) {
          return "" + b.from + "," + b.to;
        });
        return blocks.join(';');
      };

      _Class.prototype.getPermalink = function() {
        var activeHeaderItem, activeHeaderTab, hash, highlightedLine, params, period, settings, windowParams;
        params = [];
        params.push({
          key: 'component',
          value: this.options.main.component.get('key')
        });
        settings = [];
        _.map(this.options.main.settings.toJSON(), function(v, k) {
          if (v) {
            return settings.push(k);
          }
        });
        params.push({
          key: 'settings',
          value: settings.join(',')
        });
        params.push({
          key: 'blocks',
          value: this.serializeShowBlocks()
        });
        activeHeaderTab = this.state.get('activeHeaderTab');
        if (activeHeaderTab) {
          params.push({
            key: 'tab',
            value: activeHeaderTab
          });
        }
        activeHeaderItem = this.state.get('activeHeaderItem');
        if (activeHeaderItem) {
          params.push({
            key: 'item',
            value: activeHeaderItem
          });
        }
        highlightedLine = this.options.main.sourceView.highlightedLine;
        period = this.state.get('period');
        if (period != null) {
          params.push({
            key: 'period',
            value: period.get('key')
          });
        }
        if (this.options.main.currentIssue) {
          params.push({
            key: 'currentIssue',
            value: this.options.main.currentIssue
          });
        }
        if (highlightedLine) {
          params.push({
            key: 'line',
            value: highlightedLine
          });
        }
        hash = params.map(function(d) {
          return "" + d.key + "=" + (encodeURIComponent(d.value));
        }).join('&');
        windowParams = 'resizable=1,scrollbars=1,status=1';
        return window.open("" + baseUrl + "/component/index#" + hash, this.options.main.component.get('name'), windowParams);
      };

      _Class.prototype.serializeData = function() {
        var component;
        component = this.component.toJSON();
        if (component.measures) {
          component.measures.maxIssues = Math.max(component.measures.fBlockerIssues || 0, component.measures.fCriticalIssues || 0, component.measures.fMajorIssues || 0, component.measures.fMinorIssues || 0, component.measures.fInfoIssues || 0);
        }
        return {
          settings: this.options.main.settings.toJSON(),
          state: this.state.toJSON(),
          showSettings: this.showSettings,
          component: component,
          currentIssue: this.options.main.currentIssue
        };
      };

      return _Class;

    })(Marionette.Layout);
  });

}).call(this);

(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('component-viewer/main',['backbone', 'backbone.marionette', 'templates/component-viewer', 'component-viewer/models/state', 'component-viewer/models/component', 'component-viewer/models/period', 'component-viewer/mixins/main-issues', 'component-viewer/mixins/main-coverage', 'component-viewer/mixins/main-duplications', 'component-viewer/mixins/main-scm', 'component-viewer/workspace', 'component-viewer/source', 'component-viewer/header', 'component-viewer/utils'], function(Backbone, Marionette, Templates, State, Component, Period, IssuesMixin, CoverageMixin, DuplicationsMixin, SCMMixin, WorkspaceView, SourceView, HeaderView, utils) {
    var $, API_COMPONENT, API_MEASURES, API_RAW_SOURCES, API_SOURCES, API_TESTS, COVERAGE_METRIC_LIST, ComponentViewer, DUPLICATIONS_METRIC_LIST, ISSUES_METRIC_LIST, LINES_LIMIT, SCROLL_OFFSET, SOURCE_METRIC_LIST, TESTS_METRIC_LIST;
    $ = jQuery;
    API_COMPONENT = "" + baseUrl + "/api/components/app";
    API_SOURCES = "" + baseUrl + "/api/sources/show";
    API_RAW_SOURCES = "" + baseUrl + "/api/sources";
    API_MEASURES = "" + baseUrl + "/api/resources";
    API_TESTS = "" + baseUrl + "/api/tests/show";
    SOURCE_METRIC_LIST = 'accessors,classes,functions,statements,' + 'ncloc,ncloc_data,lines,generated_ncloc,generated_lines,' + 'complexity,function_complexity,' + 'comment_lines,comment_lines_density,public_api,public_undocumented_api,public_documented_api_density';
    COVERAGE_METRIC_LIST = 'coverage,line_coverage,lines_to_cover,covered_lines,uncovered_lines,' + 'branch_coverage,conditions_to_cover,uncovered_conditions,' + 'it_coverage,it_line_coverage,it_lines_to_cover,it_covered_lines,it_uncovered_lines,' + 'it_branch_coverage,it_conditions_to_cover,it_uncovered_conditions,' + 'overall_coverage,overall_line_coverage,overall_lines_to_cover,overall_covered_lines,overall_uncovered_lines,' + 'overall_branch_coverage,overall_conditions_to_cover,overall_uncovered_conditions';
    ISSUES_METRIC_LIST = 'blocker_violations,critical_violations,major_violations,minor_violations,info_violations,' + 'false_positive_issues';
    DUPLICATIONS_METRIC_LIST = 'duplicated_lines_density,duplicated_blocks,duplicated_files,duplicated_lines';
    TESTS_METRIC_LIST = 'tests,test_success_density,test_failures,test_errors,skipped_tests,test_execution_time';
    SCROLL_OFFSET = 10;
    LINES_LIMIT = 3000;
    return ComponentViewer = (function(_super) {
      __extends(ComponentViewer, _super);

      function ComponentViewer() {
        return ComponentViewer.__super__.constructor.apply(this, arguments);
      }

      ComponentViewer.prototype.className = 'component-viewer';

      ComponentViewer.prototype.template = Templates['cw-layout'];

      ComponentViewer.prototype.regions = {
        workspaceRegion: '.component-viewer-workspace',
        headerRegion: '.component-viewer-header',
        sourceRegion: '.component-viewer-source'
      };

      ComponentViewer.prototype.initialize = function(options) {
        this.settings = new Backbone.Model(this.getDefaultSettings());
        if (options.settings != null) {
          if (typeof options.settings === 'string') {
            options.settings = JSON.parse(options.settings);
          }
          this.settings.set(options.settings);
        }
        this.settings.set('scm', !!localStorage.getItem('componentViewerSCM'));
        this.shouldStoreSettings = options.shouldStoreSettings;
        this.elementToFit = options.elementToFit;
        this.state = new State();
        this.component = new Component();
        if (options.component != null) {
          this.component.set(options.component);
        }
        this.workspace = new Backbone.Collection();
        this.workspaceView = new WorkspaceView({
          collection: this.workspace,
          main: this
        });
        this.source = new Backbone.Model();
        this.sourceView = new SourceView({
          model: this.source,
          main: this
        });
        this.headerView = new HeaderView({
          model: this.source,
          main: this
        });
        return this.periods = new Backbone.Collection([], {
          model: Period
        });
      };

      ComponentViewer.prototype.getDefaultSettings = function() {
        return {
          issues: false,
          coverage: false,
          duplications: false,
          scm: false,
          workspace: false
        };
      };

      ComponentViewer.prototype.storeSettings = function() {
        var scm;
        scm = this.settings.get('scm') ? 'scm' : '';
        localStorage.setItem('componentViewerSCM', scm);
        if (this.shouldStoreSettings) {
          return localStorage.setItem('componentViewerSettings', JSON.stringify(this.settings.toJSON()));
        }
      };

      ComponentViewer.prototype.fitIntoElement = function() {
        var availableHeight, availableWidth, height, source, width, workspace;
        if (!this.elementToFit) {
          return;
        }
        source = this.$(this.sourceRegion.$el);
        workspace = this.$(this.workspaceRegion.$el);
        width = this.elementToFit.width();
        height = this.elementToFit.height();
        if (width === 0 || height === 0) {
          return;
        }
        availableWidth = width - workspace.outerWidth(true) - 20;
        availableHeight = height - this.$(this.headerRegion.$el).outerHeight(true);
        source.removeClass('overflow');
        source.width(availableWidth).height(availableHeight);
        source.addClass('overflow');
        workspace.removeClass('overflow');
        workspace.height(availableHeight);
        return workspace.addClass('overflow');
      };

      ComponentViewer.prototype.onRender = function() {
        var resizeEvent;
        this.workspaceRegion.show(this.workspaceView);
        this.$el.toggleClass('component-viewer-workspace-enabled', this.settings.get('workspace'));
        this.sourceRegion.show(this.sourceView);
        this.headerRegion.show(this.headerView);
        this.fitIntoElement();
        resizeEvent = 'resize.componentViewer';
        return $(window).off(resizeEvent).on(resizeEvent, (function(_this) {
          return function() {
            return setTimeout((function() {
              return _this.fitIntoElement();
            }), 100);
          };
        })(this));
      };

      ComponentViewer.prototype.requestComponent = function(key, clear, full) {
        var COMPONENT_FIELDS, STATE_FIELDS;
        if (clear == null) {
          clear = false;
        }
        if (full == null) {
          full = true;
        }
        STATE_FIELDS = ['canBulkChange', 'canMarkAsFavourite', 'canCreateManualIssue', 'tabs', 'manual_rules', 'extensions'];
        COMPONENT_FIELDS = ['key', 'longName', 'name', 'path', 'q', 'project', 'projectName', 'subProject', 'subProjectName', 'measures', 'fav'];
        return $.get(API_COMPONENT, {
          key: key
        }, (function(_this) {
          return function(data) {
            var rules, severities, stateAttributes;
            if (clear) {
              _this.component.clear();
            }
            COMPONENT_FIELDS.forEach(function(f) {
              return _this.component.set(f, data[f]);
            });
            if (data.path != null) {
              _this.component.set('dir', utils.splitLongName(data.path).dir);
            }
            _this.component.set('isUnitTest', data.q === 'UTS');
            stateAttributes = {};
            STATE_FIELDS.forEach(function(f) {
              return stateAttributes[f] = data[f];
            });
            rules = data.rules.map(function(r) {
              return {
                key: r[0],
                name: r[1],
                count: r[2]
              };
            });
            stateAttributes.rules = _.sortBy(rules, 'name');
            severities = data.severities.map(function(r) {
              return {
                key: r[0],
                name: r[1],
                count: r[2]
              };
            });
            stateAttributes.severities = utils.sortSeverities(severities);
            if (full) {
              _this.state.clear({
                silent: true
              });
              _this.state.set(_.defaults(stateAttributes, _this.state.defaults));
            } else {
              _this.state.set(stateAttributes);
            }
            if (full) {
              _this.periods.reset([
                {
                  label: t('none')
                }
              ]);
              return data.periods.forEach(function(p) {
                var d;
                d = moment(p[2]);
                return p = _this.periods.add({
                  key: p[0],
                  label: p[1],
                  sinceDate: d.toDate()
                });
              });
            }
          };
        })(this));
      };

      ComponentViewer.prototype.requestMeasures = function(key, period) {
        var data, metrics;
        if (period == null) {
          period = null;
        }
        this.state.set('hasMeasures', true);
        if (period != null) {
          return this.requestTrends(key, period);
        }
        if (!this.component.get('isUnitTest')) {
          metrics = [SOURCE_METRIC_LIST, COVERAGE_METRIC_LIST, ISSUES_METRIC_LIST, DUPLICATIONS_METRIC_LIST].join(',');
        } else {
          metrics = [ISSUES_METRIC_LIST, TESTS_METRIC_LIST].join(',');
        }
        data = {
          resource: key,
          metrics: metrics
        };
        return $.get(API_MEASURES, data, (function(_this) {
          return function(data) {
            var lines, measures, measuresList;
            measuresList = data[0].msr || [];
            measures = _this.component.get('measures');
            lines = null;
            measuresList.forEach(function(m) {
              measures[m.key] = m.frmt_val || m.data;
              if (m.key === 'ncloc') {
                return lines = m.val;
              }
            });
            _this.component.set('measures', measures);
            if (lines < LINES_LIMIT) {
              return _this.augmentWithNclocData();
            } else {
              return delete measures['ncloc_data'];
            }
          };
        })(this));
      };

      ComponentViewer.prototype.requestTrends = function(key, period) {
        var data, metrics;
        if (!this.component.get('isUnitTest')) {
          metrics = COVERAGE_METRIC_LIST;
        } else {
          metrics = '';
        }
        metrics = metrics.split(',').map(function(m) {
          return "new_" + m;
        }).join(',');
        data = {
          resource: key,
          metrics: metrics,
          includetrends: true
        };
        return $.get(API_MEASURES, data, (function(_this) {
          return function(data) {
            var measures, measuresList;
            measuresList = data[0].msr || [];
            measures = _this.component.get('measures');
            measuresList.forEach(function(m) {
              var variation;
              key = m.key.substr(4);
              variation = "fvar" + period;
              return measures[key] = m[variation];
            });
            return _this.component.set('measures', measures);
          };
        })(this));
      };

      ComponentViewer.prototype.requestSource = function(key) {
        return $.get(API_SOURCES, {
          key: key
        }, (function(_this) {
          return function(data) {
            var formattedSource;
            _this.source.clear();
            formattedSource = _.map(data.sources, function(item) {
              return {
                lineNumber: item[0],
                code: item[1]
              };
            });
            return _this.source.set({
              source: data.sources,
              formattedSource: formattedSource
            });
          };
        })(this));
      };

      ComponentViewer.prototype.augmentWithNclocData = function() {
        var formattedSource, nclocData, nclocDataRaw;
        nclocDataRaw = this.component.has('measures') && this.component.get('measures')['ncloc_data'];
        if (nclocDataRaw != null) {
          formattedSource = this.source.get('formattedSource');
          nclocData = nclocDataRaw.split(';').map(function(item) {
            var tokens;
            tokens = item.split('=');
            return {
              lineNumber: +tokens[0],
              executable: tokens[1] === '1'
            };
          });
          nclocData.forEach(function(n) {
            var line;
            line = _.findWhere(formattedSource, {
              lineNumber: n.lineNumber
            });
            return line.executable = n.executable;
          });
          return this.source.set('formattedSource', formattedSource);
        }
      };

      ComponentViewer.prototype.requestTests = function(key) {
        return $.get(API_TESTS, {
          key: key
        }, (function(_this) {
          return function(data) {
            _this.state.set('hasTests', true);
            return _this.component.set('tests', _.sortBy(data.tests, 'name'));
          };
        })(this));
      };

      ComponentViewer.prototype.open = function(key) {
        this.workspace.reset([]);
        return this._open(key, false);
      };

      ComponentViewer.prototype._open = function(key, showFullSource) {
        var component, source;
        if (showFullSource == null) {
          showFullSource = true;
        }
        this.key = key;
        this.sourceView.showSpinner();
        source = this.requestSource(key);
        component = this.requestComponent(key);
        this.currentIssue = null;
        return component.done((function(_this) {
          return function() {
            _this.updateWorkspaceComponents();
            _this.state.set('removed', false);
            return source.always(function() {
              if (source.status === 403) {
                _this.state.set('sourceSecurity', true);
              }
              _this.state.set('hasSource', source.status !== 404);
              _this.render();
              if (showFullSource) {
                _this.showAllLines();
              }
              if (_this.settings.get('issues')) {
                _this.showIssues();
              } else {
                _this.hideIssues();
                _this.trigger('sized');
              }
              if (_this.settings.get('coverage')) {
                _this.showCoverage();
              } else {
                _this.hideCoverage();
              }
              if (_this.settings.get('duplications')) {
                _this.showDuplications();
              } else {
                _this.hideDuplications();
              }
              if (_this.settings.get('scm')) {
                _this.showSCM();
              } else {
                _this.hideSCM();
              }
              return _this.trigger('loaded');
            });
          };
        })(this)).fail((function(_this) {
          return function(r) {
            if (component.status === 404) {
              _this.state.set('removed', true);
              _this.state.set('removedMessage', _.pluck(r.responseJSON.errors, 'msg').join('. '));
              _this.state.set('hasSource', false);
              _this.render();
              return _this.trigger('loaded');
            } else {
              return _this.cannotOpen();
            }
          };
        })(this));
      };

      ComponentViewer.prototype.updateWorkspaceComponents = function() {
        this.workspace.where({
          key: this.component.get('key')
        }).forEach((function(_this) {
          return function(model) {
            return model.set({
              'component': _this.component.toJSON()
            });
          };
        })(this));
        return this.workspace.each((function(_this) {
          return function(w) {
            var options;
            options = w.get('options');
            _.where(options, {
              key: _this.component.get('key')
            }).forEach(function(model) {
              return model.component = _this.component.toJSON();
            });
            return w.set('options', options);
          };
        })(this));
      };

      ComponentViewer.prototype.cannotOpen = function() {
        return this.$el.html("<div class='message-error'>" + (t('component_viewer.cannot_show')) + "</div>");
      };

      ComponentViewer.prototype.toggleWorkspace = function(store) {
        if (store == null) {
          store = false;
        }
        if (this.settings.get('workspace')) {
          this.hideWorkspace();
        } else {
          this.showWorkspace();
        }
        this.fitIntoElement();
        if (store) {
          return this.storeSettings();
        }
      };

      ComponentViewer.prototype.showWorkspace = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('workspace', true);
        if (store) {
          this.storeSettings();
        }
        this.$el.addClass('component-viewer-workspace-enabled');
        return this.workspaceView.render();
      };

      ComponentViewer.prototype.hideWorkspace = function(store) {
        if (store == null) {
          store = false;
        }
        this.settings.set('workspace', false);
        if (store) {
          this.storeSettings();
        }
        this.$el.removeClass('component-viewer-workspace-enabled');
        return this.workspaceView.render();
      };

      ComponentViewer.prototype.showAllLines = function() {
        this.sourceView.resetShowBlocks();
        this.sourceView.showBlocks.push({
          from: 0,
          to: _.size(this.source.get('source'))
        });
        return this.sourceView.render();
      };

      ComponentViewer.prototype.hideAllLines = function() {
        this.sourceView.resetShowBlocks();
        return this.sourceView.render();
      };

      ComponentViewer.prototype.showRawSources = function() {
        var key, url;
        key = encodeURIComponent(this.component.get('key'));
        url = "" + API_RAW_SOURCES + "?resource=" + key + "&format=txt";
        return location.href = url;
      };

      ComponentViewer.prototype.enablePeriod = function(periodKey, activeHeaderItem) {
        var period;
        period = periodKey === '' ? null : this.periods.findWhere({
          key: periodKey
        });
        this.state.set('period', period);
        return $.when(this.requestMeasures(this.key, period != null ? period.get('key') : void 0), this.requestIssuesPeriod(this.key, period != null ? period.get('key') : void 0), this.requestSCM(this.key)).done((function(_this) {
          return function() {
            if (activeHeaderItem != null) {
              _this.state.set('activeHeaderItem', activeHeaderItem);
            }
            return _this.headerView.render();
          };
        })(this));
      };

      ComponentViewer.prototype.addTransition = function(transition, options) {
        return this.workspace.add({
          key: this.component.get('key'),
          component: this.component.toJSON(),
          transition: transition,
          options: options,
          active: false
        });
      };

      ComponentViewer.prototype.scrollToLine = function(line) {
        var d, row;
        row = this.sourceView.$(".row[data-line-number=" + line + "]");
        if (!(row.length > 0)) {
          if (!this.scrolled) {
            setTimeout(((function(_this) {
              return function() {
                return _this.scrollToLine(line);
              };
            })(this)), 100);
          }
          return;
        }
        this.scrolled = line;
        d = row.offset().top - this.$(this.sourceRegion.$el).offset().top + this.$(this.sourceRegion.$el).scrollTop() - SCROLL_OFFSET;
        return this.scrollPlusDelta(d);
      };

      ComponentViewer.prototype.scrollPlusDelta = function(delta) {
        return this.$(this.sourceRegion.$el).scrollTop(delta);
      };

      ComponentViewer.prototype._filterByLines = function(predicate) {
        var formattedSource;
        formattedSource = this.source.get('formattedSource');
        this.sourceView.resetShowBlocks();
        formattedSource.forEach((function(_this) {
          return function(line) {
            var ln;
            if (predicate(line)) {
              ln = line.lineNumber;
              return _this.sourceView.addShowBlock(ln, ln);
            }
          };
        })(this));
        return this.sourceView.render();
      };

      ComponentViewer.prototype.filterByLines = function() {
        this.resetIssues();
        return this.showAllLines();
      };

      ComponentViewer.prototype.filterByNcloc = function() {
        this.resetIssues();
        return this._filterByLines(function(line) {
          return line != null ? line.executable : void 0;
        });
      };

      return ComponentViewer;

    })(utils.mixOf(Marionette.Layout, IssuesMixin, CoverageMixin, DuplicationsMixin, SCMMixin));
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

  requirejs(['backbone.marionette', 'component-viewer/main'], function(Marionette, ComponentViewer) {
    var $, API_ISSUE, App, el, l10nXHR;
    $ = jQuery;
    API_ISSUE = "" + baseUrl + "/api/issues/show";
    App = new Marionette.Application();
    el = $('#body');
    App.addRegions({
      viewerRegion: '#component-viewer'
    });
    App.resizeContainer = function() {
      var height, width;
      width = $(window).width();
      height = $(window).height();
      return el.innerWidth(width).innerHeight(height);
    };
    App.requestComponentViewer = function(s, currentIssue) {
      var settings;
      if (s != null) {
        settings = {
          issues: false,
          coverage: false,
          duplications: false,
          scm: false,
          workspace: false
        };
        s.split(',').forEach(function(d) {
          return settings[d] = true;
        });
        if (currentIssue != null) {
          settings.issues = false;
        }
      } else {
        settings = null;
      }
      if (App.componentViewer == null) {
        this.resizeContainer();
        $(window).on('resize', (function(_this) {
          return function() {
            return _this.resizeContainer();
          };
        })(this));
        App.componentViewer = new ComponentViewer({
          settings: settings,
          elementToFit: el
        });
        App.viewerRegion.show(App.componentViewer);
      }
      return App.componentViewer;
    };
    App.addInitializer(function() {
      var blocks, loadIssue, params, paramsHash, viewer;
      paramsHash = location.hash.substr(1);
      params = {};
      paramsHash.split('&').forEach(function(d) {
        var t;
        t = d.split('=');
        return params[t[0]] = decodeURIComponent(t[1]);
      });
      viewer = App.requestComponentViewer(params.settings, params.currentIssue);
      if (params.component != null) {
        loadIssue = function(key) {
          return $.get(API_ISSUE, {
            key: key
          }, (function(_this) {
            return function(r) {
              return viewer.showIssues(false, r.issue);
            };
          })(this));
        };
        if (params.line != null) {
          viewer.sourceView.highlightedLine = params.line;
          viewer.on('sized', function() {
            viewer.off('sized');
            return viewer.scrollToLine(params.line);
          });
        }
        if (params.blocks != null) {
          blocks = params.blocks.split(';').map(function(b) {
            var t;
            t = b.split(',');
            return {
              from: +t[0],
              to: +t[1]
            };
          });
          viewer.on('resetShowBlocks', function() {
            viewer.off('resetShowBlocks');
            return viewer.sourceView.showBlocks = blocks;
          });
        }
        viewer.open(params.component);
        return viewer.on('loaded', function() {
          viewer.off('loaded');
          if ((params.tab != null) && (params.item != null) && (params.period != null)) {
            return viewer.headerView.enableBar(params.tab).done(function() {
              return viewer.enablePeriod(+params.period, params.item);
            });
          } else if ((params.tab != null) && (params.item != null)) {
            viewer.state.set({
              activeHeaderTab: params.tab,
              activeHeaderItem: params.item
            });
            return viewer.headerView.render();
          } else if ((params.tab != null) && (params.period != null)) {
            return viewer.headerView.enableBar(params.tab).done(function() {
              return viewer.enablePeriod(params.period);
            });
          } else if ((params.tab != null) && (params.currentIssue != null)) {
            return loadIssue(params.currentIssue).done(function() {
              viewer.state.set({
                activeHeaderTab: params.tab
              });
              return viewer.headerView.render();
            });
          } else if (params.tab != null) {
            viewer.state.set({
              activeHeaderTab: params.tab
            });
            viewer.headerView.render();
            return viewer.showAllLines();
          } else if (params.currentIssue != null) {
            return loadIssue(params.currentIssue);
          } else {
            return viewer.showAllLines();
          }
        });
      }
    });
    l10nXHR = window.requestMessages();
    return $.when(l10nXHR).done(function() {
      return App.start();
    });
  });

}).call(this);

define("component-viewer/app", function(){});

