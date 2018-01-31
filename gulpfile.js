const gulp = require('gulp');
const sass = require('gulp-sass');
const glob = require("glob");
const babel = require('gulp-babel');
const autoprefixer = require('gulp-autoprefixer');
const rename = require("gulp-rename");
const uglify = require('gulp-uglify');
const fs = require('fs');
const cleanCSS = require('gulp-clean-css');
const kss = require('kss');

gulp.task('styleguide', ['sass'] , function(cb) {
  return kss({
    source: 'component',
    title: 'Styleguide',
    builder: 'styleguide/builder',
    destination: 'styleguide',
    homepage: 'overview.md',
    "extend-drupal8": true,
  });
});

gulp.task('sass', function () {
  return gulp.src(['**/*.sass', '!./variables/*.sass'])
    .pipe(sass({
      includePaths: './variables/',
      outputStyle: 'compressed'
    }).on('error', sass.logError))
    .pipe(autoprefixer({
      browsers: ['last 2 versions'],
      grid: true,
    }))
    .pipe(cleanCSS({level: 2, rebase: false}))
    .pipe(gulp.dest('./'));
});

/* create a new scheme css */
// gulp.task('create-green', function () {
//   return gulp.src(['**/*.turquoise.sass'])
//     .pipe(rename(function (path) {
//       path.basename = path.basename.replace(/\.turquoise/, '.green');
//     }))
//     .pipe(gulp.dest('./'));
// });

gulp.task('js', ['sass'],function () {
  return gulp.src('*/**/*.es6')
    .pipe(babel({
        presets: ['env']
    }))
    .pipe(rename(function (path) {
      path.extname = ".min.js"
    }))
    .pipe(uglify())
    .pipe(gulp.dest('./'));
});

 
gulp.task('watch', ['styleguide'], function () {
  gulp.watch(['**/*.sass', 'component/**/*.example.yml', 'component/**/*.twig'], ['styleguide']);
  gulp.watch('*/**/*.es6', ['js']);
  gulp.watch('component/overview.md', ['styleguide']);
  gulp.watch('styleguide/styleguide-builder/*.*', ['styleguide']);
  gulp.watch('base/icons/svg/*/*.svg', ['icons']);
});

gulp.task('default', ['watch']);

const iconfont = require('gulp-iconfont');
const cheerio = require('gulp-cheerio');

gulp.task('icons', function() {
  const iconDir = 'base/icons/';
  const svgDir = 'base/icons/svg/';
  fs.readdir(svgDir, function (err, files) {
    for (const fontName of files) {
      if (fs.statSync(svgDir + fontName).isDirectory()) {
        let options = {
          fontName: fontName,
          prependUnicode: true,
          ascent: 800,
          descent: 200,
          fontHeight: 1000,
          ligatures: true,
          formats: ['ttf', 'woff']
        };
        gulp.src(svgDir + fontName + '/*.svg')
          .pipe(cheerio(function ($, file) {
            let $uses = $('use');
            $uses.each(function() {
              $use = $(this);
              let selector = $use.attr('xlink:href');
              let $target = $(selector);
              let transform = $use.attr('transform');
              $target.attr({
                'transform': transform
              });
              let fill = $use.attr('fill');
              if (fill) {
                $target.attr({
                  'fill': fill
                });
              }
              let stroke = $use.attr('stroke');
              if (stroke) {
                $target.attr({
                  'stroke': stroke
                });
              }
              $use.replaceWith($target);
            });
            $('[style="mix-blend-mode:normal;"]').removeAttr('style');
            $('[figma\\:type]').removeAttr('figma:type');
          }))
          .pipe(iconfont(options))
          .on('glyphs', function(glyphs, options) {
            let allGlyphs = '';
            for (index in glyphs) {
              allGlyphs += '  ' + glyphs[index].unicode[0];
            }

            console.log('Create font "' + options.fontName + '" including the following gylpths:');
            console.log(allGlyphs);
          })
          .pipe(gulp.dest(iconDir));
      }
    }

  });
});

