## Example of using filecoin-signing-tools PCH functions in node


### How to run

1.  You need a Lotus instance somewhere that has an open JSON-RPC API port

2.  Create a .env file based on the template in this repo

3.  Update the `index_secp.js` source code to use the IP:PORT of your Lotus instance's JSON-RPC interface..

4.  Make sure your From wallet (the whose private key is in .env) has some FIL. 2 FIL should be enough.

5.  Make sure your To wallet is on chain, i.e., that it has been used before.  If it hasn't, send 1 attofil to it just to get it on chain.

6.  Run the `index_secp.js` script like this:

````
$ node index_secp.js
````

### Open Issues

 - [**index.js**](/mgoelzer/zondax-pch-demo/blob/master/index.js) - Currently does not work because of a bug that prevents use with BLS wallets.  Track the [issue here](https://github.com/Zondax/filecoin-signing-tools/issues/297).
 - [**index_secp.js**](/mgoelzer/zondax-pch-demo/blob/master/index_secp.js) - This one works because it only uses Secp256k1 addresses. There is a minor bug that prevents signed payment vouchers from updating the channel. The call goes through, but the channel sees the voucher amount as 0.  Track [issue here](https://github.com/Zondax/filecoin-signing-tools/issues/306).

Note: Both files are derived from [wasm_node/payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js).
