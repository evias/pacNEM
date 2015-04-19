PacMan: single and multiplayers
=========

An online version of the famous PacMan game. It features the ability to play online with up to 4 players on the same grid.

Initially the project focused on a 100% client-side version of the PacMan game. Due to a will to discover both websockets and Node.js, I decided to increase this challenge by creating a program with a light client and heavy server.
The last commit on the client only version is 0ff5bcbdb37726a8097032dfba5ff3a149b1a626. This new architecture allowed to add a multiplayers functionnality.

So that this version has two sides:
- a server (Node.js): Which has to manage the whole game. It has to compute each iteration of it and send back results to as many clients as necessary.
- a client: Which has to render what has been computed server-side.
