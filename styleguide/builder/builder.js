  'use strict';

/**
 * This module is used to load the base KSS builder class needed by this builder
 * and to define any custom CLI options or extend any base class methods.
 *
 * Note: since this builder wants to extend the KssBuilderBaseTwig class, it
 * must export a KssBuilderBaseTwig sub-class as a module. Otherwise, kss-node
 * will assume the builder wants to use the KssBuilderBaseHandlebars class.
 *
 * This file's name should follow standard node.js require() conventions. It
 * should either be named index.js or have its name set in the "main" property
 * of the builder's package.json. See
 * http://nodejs.org/api/modules.html#modules_folders_as_modules
 *
 * @module kss/builder/twig
 */


// We want to extend kss-node's Twig builder so we can add options that
// are used in our templates.
let KssBuilderBaseTwig;

try {
  // In order for a builder to be "kss clone"-able, it must use the
  // require('kss/builder/path') syntax.
  KssBuilderBaseTwig = require('kss/builder/base/twig');
} catch (e) {
  // The above require() line will always work.
  //
  // Unless you are one of the developers of kss-node and are using a git clone
  // of kss-node where this code will not be inside a "node_modules/kss" folder
  // which would allow node.js to find it with require('kss/anything'), forcing
  // you to write a long-winded comment and catch the error and try again using
  // a relative path.
  KssBuilderBaseTwig = require('../base/twig');
}

const marked = require('marked'),
  path = require('path'),
  Promise = require('bluebird');

const fs = Promise.promisifyAll(require('fs-extra')),
  glob = Promise.promisify(require('glob')),
  kssBuilderAPI = '3.0',
  YAML = require('yamljs');
/**
 * A kss-node builder that takes input files and builds a style guide using Twig
 * templates.
 */
class KssBuilderTwig extends KssBuilderBaseTwig {
  /**
   * Create a builder object.
   */
  constructor() {
    // First call the constructor of KssBuilderBaseTwig.
    super();

    // Then tell kss which Yargs-like options this builder adds.
    this.addOptionDefinitions({
      title: {
        group: 'Style guide:',
        string: true,
        multiple: false,
        describe: 'Title of the style guide',
        default: 'KSS Style Guide'
      }
    });
  }

  /**
   * Renders the template for a section and saves it to a file.
   *
   * @param {string} templateName The name of the template to use.
   * @param {object} options The `getTemplate` and `templateRender` options
   *   necessary to use this helper method; should be the same as the options
   *   passed to BuildGuide().
   * @param {string|null} pageReference The reference of the current page's root
   *   section, or null if the current page is the homepage.
   * @param {Array} sections An array of KssSection objects.
   * @param {Object} [context] Additional context to give to the template when
   *   it is rendered.
   * @returns {Promise} A `Promise` object.
   */
  buildPage(templateName, options, pageReference, sections, context) {
    let getTemplate = options.getTemplate,
      getTemplateMarkup = options.getTemplateMarkup,
      templateRender = options.templateRender;

    context = context || {};
    context.template = {
      isHomepage: templateName === 'index',
      isSection: templateName === 'section',
      isItem: templateName === 'item'
    };
    context.styleGuide = this.styleGuide;
    context.sections = sections.map(section => {
      return section.toJSON();
    });
    context.hasNumericReferences = this.styleGuide.hasNumericReferences();
    context.sectionTemplates = this.sectionTemplates;
    context.options = this.options;

    // Performs a shallow clone of the context clone so that the modifier_class
    // property can be modified without affecting the original value.
    let contextClone = data => {
      let clone = {};
      for (var prop in data) {
        // istanbul ignore else
        if (data.hasOwnProperty(prop)) {
          clone[prop] = data[prop];
        }
      }
      return clone;
    };

    // Render the template for each section markup and modifier.
    return Promise.all(
      context.sections.map(section => {
        // If the section does not have any markup, render an empty string.
        if (!section.markup) {
          return Promise.resolve();
        } else {
          // Load the information about this section's markup template.
          let templateInfo = this.sectionTemplates[section.reference];
          let markupTask,
            exampleTask = false,
            exampleContext,
            modifierRender = (template, data, modifierClass) => {
              data = contextClone(data);
              /* eslint-disable camelcase */
              data.modifier_class = (data.modifier_class ? data.modifier_class + ' ' : '') + modifierClass;
              /* eslint-enable camelcase */
              return templateRender(template, data);
            };

          var exampleDataFilename = templateInfo.filename.replace(/\.twig$/, '.example.yml');

          templateInfo.context = [[]];
          if (fs.existsSync(exampleDataFilename)) {
            var exampleData = YAML.load(exampleDataFilename);
            if(Array.isArray(exampleData)) {
              templateInfo.context = exampleData;
            } else {
              templateInfo.context[0] = exampleData;
            }
          }
          for (var i = 0, len = templateInfo.context.length; i < len; i++) {
            templateInfo.context[i].templates = '../..';
            templateInfo.context[i].attach_library = function() { return '' };
          }

          // Set the section's markup variable. It's either the template's raw
          // markup or the rendered template.
          if (!this.options.markup && path.extname(templateInfo.filename) === '.' + options.templateExtension) {
            markupTask = getTemplateMarkup(templateInfo.name).then(markup => {
              // Copy the template's raw (unrendered) markup.
              section.markup = markup;
            });
          } else {
            // Temporarily set it to "true" until we create a proper Promise.
            exampleTask = !(templateInfo.exampleName);
            markupTask = getTemplate(templateInfo.name).then(template => {
              section.markup = modifierRender(
                template,
                templateInfo.context,
                // Display the placeholder if the section has modifiers.
                (section.modifiers.length !== 0 ? this.options.placeholder : '')
              );

              // If this section doesn't have a "kss-example" template, we will
              // be re-using this template for the rendered examples.
              if (!templateInfo.exampleName) {
                exampleTask = Promise.resolve(template);
              }
            });
          }

          // Pick a template to use for the rendered example variable.
          if (templateInfo.exampleName) {
            exampleTask = getTemplate(templateInfo.exampleName);
            exampleContext = templateInfo.exampleContext;
          } else {
            if (!exampleTask) {
              exampleTask = getTemplate(templateInfo.name);
            }
            exampleContext = templateInfo.context;
          }

          // Render the example variable and each modifier's markup.
          return markupTask.then(() => {
            return exampleTask;
          }).then(template => {
            section.example = '';
            for (var i = 0, len = exampleContext.length; i < len; i++) {
              section.example += "\n" + templateRender(template, contextClone(exampleContext[i]));
            }
            section.modifiers.forEach(modifier => {
              modifier.markup = '';
              for (var i = 0, len = exampleContext.length; i < len; i++) {
                modifier.markup += "\n" + modifierRender(
                  template,
                  exampleContext[i],
                  modifier.className
                );
              }
            });
            return Promise.resolve();
          });
        }
      })
    ).then(() => {

      // Create the HTML to load the optional CSS and JS (if a sub-class hasn't already built it.)
      // istanbul ignore else
      if (typeof context.styles === 'undefined') {
        context.styles = '';
        for (let key in this.options.css) {
          // istanbul ignore else
          if (this.options.css.hasOwnProperty(key)) {
            context.styles = context.styles + '<link rel="stylesheet" href="' + this.options.css[key] + '">\n';
          }
        }
      }
      // istanbul ignore else
      if (typeof context.scripts === 'undefined') {
        context.scripts = '';
        for (let key in this.options.js) {
          // istanbul ignore else
          if (this.options.js.hasOwnProperty(key)) {
            context.scripts = context.scripts + '<script src="' + this.options.js[key] + '"></script>\n';
          }
        }
      }

      // Create a menu for the page (if a sub-class hasn't already built one.)
      // istanbul ignore else
      if (typeof context.menu === 'undefined') {
        context.menu = this.createMenu(pageReference);
      }

      // Determine the file name to use for this page.
      if (pageReference) {
        let rootSection = this.styleGuide.sections(pageReference);
        if (this.options.verbose) {
          this.log(
            ' - ' + templateName + ' ' + pageReference
            + ' ['
            + (rootSection.header() ? rootSection.header() : /* istanbul ignore next */ 'Unnamed')
            + ']'
          );
        }
        // Convert the pageReference to be URI-friendly.
        pageReference = rootSection.referenceURI();
      } else if (this.options.verbose) {
        this.log(' - homepage');
      }
      let fileName = templateName + (pageReference ? '-' + pageReference : '') + '.html';

      let getHomepageText;
      if (templateName !== 'index') {
        getHomepageText = Promise.resolve();
        context.homepage = false;
      } else {
        // Grab the homepage text if it hasn't already been provided.
        getHomepageText = (typeof context.homepage !== 'undefined') ? /* istanbul ignore next */ Promise.resolve() : Promise.all(
          this.options.source.map(source => {
            return glob(source + '/**/' + this.options.homepage);
          })
        ).then(globMatches => {
          for (let files of globMatches) {
            if (files.length) {
              // Read the file contents from the first matched path.
              return fs.readFileAsync(files[0], 'utf8');
            }
          }

          if (this.options.verbose) {
            this.log('   ...no homepage content found in ' + this.options.homepage + '.');
          } else {
            this.log('WARNING: no homepage content found in ' + this.options.homepage + '.');
          }
          return '';
        }).then(homePageText => {
          // Ensure homePageText is a non-false value. And run any results through
          // Markdown.
          context.homepage = homePageText ? marked(homePageText) : '';
          return Promise.resolve();
        });
      }

      return getHomepageText.then(() => {
        // Render the template and save it to the destination.
        return fs.writeFileAsync(
          path.join(this.options.destination, fileName),
          templateRender(this.templates[templateName], context)
        );
      });
    });
  }
}

module.exports = KssBuilderTwig;
