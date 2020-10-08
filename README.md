This repo contains demo code to show off the features of [`zondax/filecoin-signing-tools`](https://github.com/zondax/filecoin-signing-tools/), a Rust library developed by Zondax that includes support for Filecoin Payment Channels and by default will be compiled to Wasm.  This library is perfect for use with a shared Lotus instance in the cloud, since your wallet **private keys will never leave your browser or node application**.

The Wasm compilation target creates code that can be used in both browser-based and Nodejs applications.  This example demonstrates usage in a Node application for simplicity.

## Example of using filecoin-signing-tools PCH functions in node

### Running the Script (local clone of zondax/filecoin-signing-tools)

#### What you'll need:

 - **Nodejs**. `index.js` is a Nodejs application, so make sure you have that installed.
 - **Lotus w/ JSON-RPC port open**. 
 - **Rust** You'll need a full rust toolchain to compile [`zondax/filecoin-signing-tools`](https://github.com/zondax/filecoin-signing-tools/).

#### Instructions:

0.  Create an empty parent directory, and git clone two repos into subdirectories of it:

- `git clone https://github.com/zondax/filecoin-signing-tools/`

- `git clone https://github.com/mgoelzer/zondax-pch-demo` (this repo)

You should now have:

```
 \- parentdir
    |
    +- filecoin-signing-tools
    |
    \- zondax-pch-demo
```

1.  In `filecoin-signing-tools`, run `make` to build all of the filcoin-signing-tools library. Note that you may get some small compile errors that require changing code downloaded by cargo in the `forest_message` crate.  The fixes are self explanatory.

2.  cd into `../zondax-pch-demo`

3.  Use the [dot-env-template](dot-env-template) example file to create your own private .env file.

4.  Both your To and From wallets should have 1 FIL, both for gas and to ensure they are already on chain entities.

5.  Run the script:  `node index_secp.js`


### Running the Script (npm package)

Note:  The npm package assumes you are using a gas estimator, so by default it will set all gas fields to zero in every message it creates.  The `index.js` script does not currently use a gas estimator, so if you go the npm package route, you will need to add some gas estimation calls.  See [payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js) for an example of how to do this.

#### What you'll need  

The requirements are the same as above, except you don't need the rust tool chain since you'll instead be using the npm package for filecoin-signing-tools, which includes precompiled wasm binaries.

#### Instructions

0.  Clone this repo and swtich over to the branch `npm-version`.  Then `npm install` using the supplied `package.json`.

1.  Continue at Step 3 in the above "local clone" directions.


### Notes

 - This example is derived from [wasm_node/payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js)

 - Contributions are welcome, both to this demo script and to the  main project [github.com/zondax/filecoin-signing-tools](https://github.com/Zondax/filecoin-signing-tools)
