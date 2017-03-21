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
		}
	});

	// Load plugin
	grunt.loadNpmTasks("grunt-coveralls");
	grunt.loadNpmTasks("grunt-mocha-istanbul");

	// Task to run tests
	grunt.registerTask('default', 'mocha_istanbul');
	grunt.registerTask('mocha', 'mocha_istanbul');
};

