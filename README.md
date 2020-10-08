## Example of using filecoin-signing-tools PCH functions in node


### Running the Script

`index.js` is a Nodejs application, so make sure you have that installed.

0.  `npm install @zondax/filecoin-signing-tools@0.11.0`

1.  Have a Lotus instance somewhere with an exposed JSON-RPC API port.

2.  Use the [dot-env-template](dot-env-template) example file to create your own private .env file.

3.  Both your To and From wallets should have 1 FIL, both for gas and to ensure they are already on chain entities.

4.  Run the script:  `node index_secp.js`


### Notes

 - This example is derived from [wasm_node/payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js)

 - Contributions are welcome, both to this demo script and to the  main project [github.com/zondax/filecoin-signing-tools](https://github.com/Zondax/filecoin-signing-tools)
