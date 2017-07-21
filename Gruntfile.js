module.exports = function(grunt) {
    //Project configuration.
    grunt.initConfig({
        mocha_istanbul: {
            src: ["test/www"],
            options: {
                coverage: true,
                root: '.',
                reportFormats: ['lcovonly']
            }
        },
        coveralls: {
            options: {
                force: true
            },
            main_target: {
                src: "coverage/lcov.info"
            }
        },
        uglify: {
            options: { sourceMap: true },
            dist: {
                files: {
                    'www/js/pacnem.min.js': [
                        'www/js/pacnem-utils.js',
                        'www/js/pacnem-api-client.js',
                        'www/js/pacnem-session.js',
                        'www/js/pacnem-sponsor-engine.js',
                        'www/js/pacnem-ui.js',
                        'www/js/pacnem-controller.js'
                    ],
                    'www/3rdparty/pacnem-deps.min.js': [
                        'www/3rdparty/jquery.min.js',
                        'www/3rdparty/bootstrap-3.3.7/js/bootstrap.min.js',
                        'www/3rdparty/handlebars.min.js'
                    ]
                }
            },
            deps: {
                files: {
                    'www/js/nem-sdk.min.js': [
                        'www/js/nem-sdk.js'
                    ]
                }
            }
        }
    });

    // Load plugins
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-coveralls");
    grunt.loadNpmTasks("grunt-mocha-istanbul");

    // Tasks to run tests and uglify frontend assets
    grunt.registerTask('default', ['uglify:dist', 'uglify:deps', 'mocha_istanbul']);
    grunt.registerTask('mocha', 'mocha_istanbul');
};