/**
 * Part of the evias/pacNEM package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/pacNEM
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @contributor Nicolas Dubien (https://github.com/dubzzz)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 * @link       https://gist.github.com/utkarsh2012/2287070
 */

/*
 * This decorates Handlebars.js with the ability to load
 * templates from an external source, with light caching.
 *
 * To render a template, pass a closure that will receive the
 * template as a function parameter, eg,
 *   T.render('templateName', function(t) {
 *       $('#somediv').html( t() );
 *   });
 */
var jQFileTemplate = function() {
    this.cached = {};
};
var T = new jQFileTemplate();
$.extend(jQFileTemplate.prototype, {
    render: function(name, callback) {
        //if (T.isCached(name)) {
        //    callback(T.cached[name]);
        //} else {
        $.get(T.urlFor(name), function(raw) {
            T.store(name, raw);
            //        T.render(name, callback);
            callback(T.cached[name]);
        });
        //}
    },
    renderSync: function(name, callback) {
        if (!T.isCached(name)) {
            T.fetch(name);
        }
        T.render(name, callback);
    },
    prefetch: function(name) {
        $.get(T.urlFor(name), function(raw) {
            T.store(name, raw);
        });
    },
    fetch: function(name) {
        // synchronous, for those times when you need it.
        if (!T.isCached(name)) {
            var raw = $.ajax({ 'url': T.urlFor(name), 'async': false }).responseText;
            T.store(name, raw);
        }
    },
    isCached: function(name) {
        return !!T.cached[name];
    },
    store: function(name, raw) {
        T.cached[name] = Handlebars.compile(raw);
    },
    urlFor: function(name) {
        return "/resources/templates/" + name;
    }
});