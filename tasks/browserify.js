'use strict';

var fs = require('fs');
var path = require('path');
var mold = require('mold-source-map')


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

    grunt.event.on('watch.browserify', function(action, filepath) {
      filepath = path.resolve(filepath)
      delete cache[filepath]
      watching[filepath] = false

      if (action === 'added' && opts.multifile) {
        b.add(filepath)
      }
      if (action === 'deleted' && opts.multifile) {
        b.files = b.files.filter(function(f) {
          return f != filepath;
        });
        b._entries = b._entries.filter(function(f) {
          return f != filepath;
        });
      }
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
      
      if (opts.aliasMappings) {
        aliases = opts.aliasMappings.slice ? opts.aliasMappings : [opts.aliasMappings];
        aliases.forEach(function (alias) {
          alias.expand = true; // so the user doesn't have to specify
          grunt.file.expandMapping(alias.src, alias.dest, alias)
            .forEach(function (file) {
              var expose = file.dest.substr(0, file.dest.lastIndexOf('.'));
              b.require(path.resolve(file.src[0]), {expose: expose});
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

      var removeSourcesContent = function(sourcemap) {
        sourcemap.sourcemap.setProperty('sourcesContent', null)
        return sourcemap.toComment()
      };

      var mapRelativeSources = function(file) {
        return 'browserify://' + path.relative(path.resolve(opts.sourceMapRoot), file)
      };

      if (opts.debug) {
        grunt.log.writeln('\n  Setup chrome workspaces like:'.bold);
        grunt.log.writeln('   Folders: ' + path.resolve(opts.sourceMapRoot).cyan);
        grunt.log.writeln('   Mappings: \n    From: ' + 'browserify://'.cyan + '\n      To: ' + path.resolve(opts.sourceMapRoot).cyan);
        grunt.log.writeln('');
      }


      var writeBundle = function (cb) {
        var done = function() {
          grunt.log.ok('Wrote bundle to ' +file.dest)
          if (cb) cb();
        }
        if (opts.debug) {
          b.bundle(opts)
            .pipe(mold.transformSources(mapRelativeSources))
            .pipe(mold.transform(removeSourcesContent))
            .pipe(fs.createWriteStream(file.dest))
            .on('close', done)
        } else {
          b.bundle(opts)
            .pipe(fs.createWriteStream(file.dest))
            .on('close', done)
        }
      };

      b.on('update', writeBundle)
      writeBundle(next)
    }, this.async());
  });
};
