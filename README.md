## Example of using filecoin-signing-tools PCH functions in node


### Questions

Grep these two files for "Discussion" to find my questions/blockers.

 - [**index.js**](/mgoelzer/zondax-pch-demo/blob/master/index.js) - My first attempt with BLS keys.  Had many problems; cannot run this.
 - [**index_secp.js**](/mgoelzer/zondax-pch-demo/blob/master/index_secp.js) - Second attempt with all secp address.  Works better, sitll some "Discussion" markers.

Note: Both files are derived from [wasm_node/payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js).

### Minor Nits

1. [Lines 22-50 on wasm_node/payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js#L26-L50) are importing a wallet private key into the Lotus instance -- we can't have that, opposite of what we want.  But I don't think later code actually depends on this.

1. [Lines 421-425 of wasm_node/payment_channels.js](https://github.com/Zondax/filecoin-signing-tools/blob/master/examples/wasm_node/payment_channel.js#L421-L425) Probably should s/update_paych_message/collect_paych_message/ though not technically wrong.


