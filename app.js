/**
 *	Node.JS server for Online-PacMan game
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server);

// Serve static files: homepage, js, css, favicon...
app
.get('/', function(req, res) {
	res.sendfile(__dirname + '/templates/index.html');
})
.get('/favicon.ico', function(req, res) {
	res.sendfile(__dirname + '/static/favicon.ico');
})
.get('/css/style.css', function(req, res) {
	res.sendfile(__dirname + '/static/css/style.css');
})
.get('/js/pacman.js', function(req, res) {
	res.sendfile(__dirname + '/static/js/pacman.js');
});

server.listen(8080);

