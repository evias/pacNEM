# PacNEM Change Log

This project follows [Semantic Versioning](CONTRIBUTING.md).

## v0.6.*

- invoices now always have a "I have Paid" button which will check blockchain transactions (stuck websocket bug)
- game sends out cheeses in case of hall of famer
- game now uses a Token Redeem system (1 played heart = 1 heart-- mosaic)
- game pays out game credits upon payment recognition
- game uses new Fee structure (testnet only) with cheaper transactions
- Hall Of Fame, Game Credits features implementations
  - hall of fame *listing* currently only updated on restart of app
  - game credits only COUNT the number of used hearts, the redeem system is not yet done.
- NEM-sdk upgrade fixes (new object structure)
- NEM Testnet Fee Structure update
  - Transactions on PacNEM Testnet are now cheaper

## v0.5.*

- implement first draft of hall of fame transaction with Cheese Mosaic
- implement Game Credits Sink Features for Token Redeem
- set hall of fame data in the blockchain transactions

## XXX
