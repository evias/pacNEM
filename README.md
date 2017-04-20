# pacNEM: single and multiplayers

A PacMan game with NodeJS using NEM Blockchain

[![Build Status](https://travis-ci.org/evias/pacNEM.svg?branch=master)](https://travis-ci.org/evias/pacNEM)[![Coverage Status](https://coveralls.io/repos/evias/pacNEM/badge.svg?branch=master)](https://coveralls.io/r/evias/pacNEM?branch=master)

An online version of the famous PacMan game. It features the ability to play online with up to 4 players on the same grid.

This fork aims to specialize the game for the NEM blockchain. A first version of the NEM integration will save High Scores
in Blockchain Transactions.

### Installation

```evias/pacNEM``` requires NodeJS, Socket.IO and Express libraries:
- Socket.IO: heavily used in this project to handle the communications between the server and its clients to establich and then run the game
- Express: used to serve static files (mainly used for its routes)

Installing these dependencies using the terminal works as follows:
```
$ cd /path/to/this/clone
$ npm install
```

### Run the Game server locally

First install all dependencies, then run following command from the Terminal:

```
node app.js
```

## Play:

https://pacnem.herokuapp.com

### Pot de vin

If you like the initiative, and for the sake of good mood, I recommend you take a few minutes to Donate a beer or Three [because belgians like that] by sending some XEM (or whatever Mosaic you think pays me a few beers someday!) to my Wallet:

NB72EM6TTSX72O47T3GQFL345AB5WYKIDODKPPYW

### License

This software is released under the [MIT](LICENSE) License.

© 2017 Grégory Saive greg@evias.be, All rights reserved.
© 2014 Nicolas DUBIEN, https://github.com/dubzzz/js-pacman.

