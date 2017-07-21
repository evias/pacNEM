# PacNEM: Multiplayer Pacman Game with the NEM Blockchain

PacNEM is a multiplayer Pacman Game using the NEM Blockchain to Reward Players and registered Sponsors.

This game features the ability to play online with up to 4 players on the same grid, arranged in Rooms manage with Socket.io.

This fork aims to specialize the game for the NEM blockchain.

### Installation

```evias/pacNEM``` requires NodeJS, Socket.IO and Express libraries:
- Socket.IO: heavily used in this project to handle the communications between the server and its clients to establich and then run the game
- Express: used to serve static files and the PacNEM API.

Installing these dependencies using the terminal works as follows:

```
$ cd /path/to/this/clone
$ npm install
```

### Run the Game server locally

Now that the game is installed, you will need to Minify the Javascript using grunt, proceed as following:

```
$ cd /path/to/this/clone
$ ./node_modules/grunt-cli/bin/grunt uglify:dist
$ ./node_modules/grunt-cli/bin/grunt uglify:deps
```

Now you can safely start the PacNEM game:

```
node app.js
```

When the PacNEM Backend is started, you should something like the following Screenshot:

![Started PacNEM Backend](/img/readme-pacnem-backend.png)

## Play:

Visit the following URL to start playing PacNEM:

https://pacnem.com

### Pot de vin

If you like the initiative, and for the sake of good mood, I recommend you take a few minutes to Donate a beer or Three [because belgians like that] by sending some XEM (or whatever Mosaic you think pays me a few beers someday!) to my Wallet:

NCK34K5LIXL4OMPDLVGPTWPZMGFTDRZQEBRS5Q2S

### License

This software is released under the [MIT](LICENSE) License.

© 2017 Grégory Saive greg@evias.be, All rights reserved.
© 2014 Nicolas DUBIEN, https://github.com/dubzzz/js-pacman.

