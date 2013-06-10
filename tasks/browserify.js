'use strict';

var fs = require('fs');
var path = require('path');

/*
 * grunt-browserify
 * https://github.com/jmreidy/grunt-browserify
 *
 * Copyright (c) 2013 Justin Reidy
 * Licensed under the MIT license.
 */
var browserify = require('browserify');
var shim = require('browserify-shim');


module.exports = function (grunt) {

  grunt.registerMultiTask('browserify', 'Grunt task for browserify.', function () {
    var cache = {};
    var watching = {};
    var b;
    var pending = false;

    var opts = this.options();

    grunt.event.on('watch', function(action, filepath) {
      filepath = path.resolve(filepath)
      grunt.log.ok(filepath)

      delete cache[filepath]
      watching[filepath] = false

      if (!pending) setTimeout(function() {
        pending = false;
        b.emit('update');
      }, opts.delay || 300);

      pending = true;
    });


    grunt.util.async.forEachSeries(this.files, function (file, next) {
      if (!file) return false
      
      var files = grunt.file.expand({filter: 'isFile'}, file.src).map(function (f) {
        return path.resolve(f);
      });

      b = browserify(files);

      b.on('error', function (err) {
        grunt.fail.warn(err);
      });


      if (opts.ignore) {
        grunt.file.expand({filter: 'isFile'}, opts.ignore)
          .forEach(function (file) {

            b.ignore(path.resolve(file));
          });
      }

      if (opts.alias) {
        var aliases = opts.alias;
        if (aliases.split) {
          aliases = aliases.split(',');
        }
        aliases.forEach(function (alias) {
          alias = alias.split(':');
          grunt.file.expand({filter: 'isFile'}, alias[0])
            .forEach(function (file) {
              b.require(path.resolve(file), {expose: alias[1]});
            });

        });
      }

      if (opts.shim) {
        var shims = opts.shim;
        Object.keys(opts.shim)
          .forEach(function (alias) {
            shims[alias].path = path.resolve(shims[alias].path);
          });
        b = shim(b, shims);
      }

      if (opts.external) {
        grunt.file.expand({filter: 'isFile'}, opts.external)
          .forEach(function (file) {
            b.external(path.resolve(file));
          });
      }

      if (opts.externalize) {
        opts.externalize.forEach(function (lib) {
          if (/\//.test(lib)) {
            grunt.file.expand({filter: 'isFile'}, lib).forEach(function (file) {
              b.require(path.resolve(file));
            });
          }
          else {
            b.require(lib);
          }
        });
      }

      if (opts.transform) {
        opts.transform.forEach(function (transform) {
          b.transform(transform);
        });
      }

      var destPath = path.dirname(path.resolve(file.dest));
      if (!grunt.file.exists(destPath)) {
        grunt.file.mkdir(destPath);
      }


      var bundle = b.bundle.bind(b);
      var first = true;

      b.on('dep', function(dep) {
        if (watching[dep.id]) return;
        watching[dep.id] = true;
        cache[dep.id] = dep;
      });

      b.bundle = function(opts_, cb) {
        if (b._pending) return bundle(opts_, cb);

        if (typeof opts_ === 'function') {
          cb = opts_;
          opts_= {};
        }

        if (!opts_) opts_ = {};
        if (!first) opts_.cache = cache;
        first = false;

        return bundle(opts_, cb);
      };

      var writeBundle = function (cb) {
        b.bundle(opts, function(err, src) {
          if (err) {
            grunt.fail.warn(err);
          }
          grunt.file.write(file.dest, src);
          grunt.log.ok('Bundled ' + file.dest);

          if(cb) cb()
        });
      }

      b.on('update', writeBundle)
      writeBundle(next)
    }, this.async());
  });
};
