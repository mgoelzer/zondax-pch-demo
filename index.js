const filecoin_signer = require('@zondax/filecoin-signing-tools');
const bip39 = require('bip39');
const bip32 = require('bip32');
const axios = require('axios');
const secp256k1 = require('secp256k1');
const cbor = require("ipld-dag-cbor").util;
const util = require("util");

const privateKeyBase64 = "qC09rxocfyHbHXnlep4QQpUIU9nZIeImy/CJ7QvRggA="
const privateKey = Buffer.from(privateKeyBase64, 'base64')
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiLCJzaWduIiwiYWRtaW4iXX0.K7ETGuBkWqCxw-5EOCxJLtpWcL3w1MywGBR1Gg7Uj4c"

const headers = { "Authorization": `Bearer ${TOKEN}` }

const URL = "http://192.168.1.23:1234/rpc/v0"

f = async () => {
	console.log("////////////////////////////////////////////////////////")
	console.log("//")
	console.log("// Key wrangling")
	console.log("//")
	console.log("////////////////////////////////////////////////////////\n")
	// Generate pkey from constant key above
	let recoveredKey = filecoin_signer.keyRecover(privateKeyBase64, true);
	console.log(">> recovered key = "+recoveredKey.address)
	// Discussion 1
	// prints:    recovered key = t1633qay3bxztgkm2ox4obvrye2rtiv5zyffjwxqi
	// should be: recovered key = t3ucc7cbhrbwuotrugsdgu6y4mutbl2wuq36hxv5aw6qtuimsmstotiqppp5b3dmvhmrrdjfnj6dqqgeovep5a
	// NB:  $ lotus wallet export t3ucc7cbhrbwuotrugsdgu6y4mutbl2wuq36hxv5aw6qtuimsmstotiqppp5b3dmvhmrrdjfnj6dqqgeovep5a | xxd -r -p
	// {"Type":"bls","PrivateKey":"qC09rxocfyHbHXnlep4QQpUIU9nZIeImy/CJ7QvRggA="}
	// TEMP: 
	recoveredKey = {"address":"t3ucc7cbhrbwuotrugsdgu6y4mutbl2wuq36hxv5aw6qtuimsmstotiqppp5b3dmvhmrrdjfnj6dqqgeovep5a"}
	let address = recoveredKey.address
	// Discussion 3:  in actual `wasm_node/payment_channel.js`, address is coming from a Filecoin.WalletImport RPC call (line 26-50).  But this defeats the whole purpose of the library (remote signing without Lotus ever seeing your keys)...
	console.log(">> recovered key = "+recoveredKey.address)
	console.log(">> address = "+address+"\n")

	// Get nonce
	console.log(" ######## GET NONCE ########")
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	console.log(">> response.data = "+util.inspect(response.data))
	nonce = response.data.result
	console.log(">> nonce = "+nonce+"\n")
	// End - get nonce


	console.log("////////////////////////////////////////////////////////")
	console.log("//")
	console.log("// PCH creation")
	console.log("//")
	console.log("////////////////////////////////////////////////////////\n")

	console.log("##### CREATE PAYMENT CHANNEL #####")

	let PAYMENT_CHANNEL_ADDRESS = "t01010"
	// Discussion 4:  is this the address of the payment channel actor? Actual
	// payment channel address will start with "t2..." 
	let create_pymtchan = filecoin_signer.createPymtChan(recoveredKey.address, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", "1000", nonce)

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(create_pymtchan, privateKey));

	console.log(">> pch create signedMessage: "+util.inspect(signedMessage))

      	console.log("##### SEND PAYMENT CHANNEL #####")
      
      	response = await axios.post(URL, {
        	jsonrpc: "2.0",
        	method: "Filecoin.MpoolPush",
        	id: 1,
       	params: [signedMessage]
      	}, { headers })

      	console.log(">> response.data="+util.inspect(response.data))
	// Discussion 5:  returns this
	//    error: { code: 1, message: 'bls signature failed to verify' }
	// We can't verify BLS sigs?
	cid = response.data.result
	console.log("message CID="+cid+"\n")


	// Wait for PCH
	console.log("##### WAIT FOR PAYMENT CHANNEL STATE #####")
	response = await axios.post(URL, {
		jsonrpc: "2.0",
		method: "Filecoin.StateWaitMsg",
		id: 1,
		params: [cid, null]
	}, { headers })
	// Discussion 5: crashes here with "server returned 500"
	// Server log shows this:
//2020-10-01T00:06:35.528Z	ERROR	rpc	go-jsonrpc@v0.1.2-0.20200822201400-474f4fdccc52/server.go:87	RPC Error: unmarshaling params for 'Filecoin.StateWaitMsg' (param: *cid.Cid): json: cannot unmarshal number into Go value of type struct { CidTarget string "json:\"/\"" }

	
	console.log(">> response.data: " + util.inspect(response.data))
	PCH = response.data.result.ReturnDec.IDAddress
	console.log(">> PCH = "+PCH)
	// End - Wait for PCH


	console.log("////////////////////////////////////////////////////////")
	console.log("//")
	console.log("// Sign and send voucher")
	console.log("//")
	console.log("////////////////////////////////////////////////////////\n")

	const VOUCHER_SIGNER = "8VcW07ADswS4BV2cxi5rnIadVsyTDDhY1NfDH19T8Uo="
	// Discussion 2:  what is this magic value?
	// It equals this hex:
	//   00000000: f157 16d3 b003 b304 b805 5d9c c62e 6b9c  .W........]...k.
	//   00000010: 869d 56cc 930c 3858 d4d7 c31f 5f53 f14a  ..V...8X...._S.J
	// No meaningful cbor decode: (simple)17 followed by garbage
	//
	// Base64 is correct length for a BLS private key.  Let's go with that.
	const VOUCHER_SIGNER_2 = privateKeyBase64 // key for `t3ucc7cbh...` addr

	// Get next nonce
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	nonce = response.data.result
	console.log("nonce = "+nonce)
	// End - Get next nonce

	let voucher = filecoin_signer.createVoucher(PAYMENT_CHANNEL_ADDRESS, BigInt(0), BigInt(0), "250", BigInt(0), BigInt(nonce), BigInt(0))

	let signedVoucher = filecoin_signer.signVoucher(voucher, VOUCHER_SIGNER_2)

	let tmp = cbor.deserialize(Buffer.from(signedVoucher, 'base64'))[10]
	console.log("signedVoucher (base64): " + Buffer.from(tmp).slice(1).toString('base64'))


	console.log("////////////////////////////////////////////////////////")
	console.log("//")
	console.log("// Update channel with signed voucher")
	console.log("//")
	console.log("////////////////////////////////////////////////////////\n")

	// Get nonce
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	nonce = response.data.result
	console.log("nonce = "+nonce)
	// End - Get nonce

	let update_paych_message = filecoin_signer.updatePymtChan(PAYMENT_CHANNEL_ADDRESS, "t3ucc7cbhrbwuotrugsdgu6y4mutbl2wuq36hxv5aw6qtuimsmstotiqppp5b3dmvhmrrdjfnj6dqqgeovep5a", signedVoucher, nonce)

	console.log("+update_paych_message"+update_paych_message)

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, privateKeyBase64));
	 
	console.log(signedMessage)
	  
	console.log("##### SEND UPDATE CHANNEL #####")
	  
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })

	console.log(response.data)

	cid = response.data.result

	// Wait for update pch message
	console.log("##### WAIT FOR PAYMENT CHANNEL STATE #####")
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log(response.data)
	// End - Wait for update pch message

	console.log("##### READ PAYMENT CHANNEL STATE #####")
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PAYMENT_CHANNEL_ADDRESS, null]
	}, { headers })
	console.log(response.data)






	console.log("////////////////////////////////////////////////////////")
	console.log("//")
	console.log("// Settle channel")
	console.log("//")
	console.log("////////////////////////////////////////////////////////\n")

	// Get nonce
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	nonce = response.data.result
	console.log("nonce = "+nonce)
	// End - Get nonce


	update_paych_message = filecoin_signer.settlePymtChan(PAYMENT_CHANNEL_ADDRESS, "t3ucc7cbhrbwuotrugsdgu6y4mutbl2wuq36hxv5aw6qtuimsmstotiqppp5b3dmvhmrrdjfnj6dqqgeovep5a", nonce)

	console.log(update_paych_message)

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, privateKey));
	  
	console.log(signedMessage)
	  
	console.log("##### SETTLE PAYMENT CHANNEL #####")
	  
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })

	console.log(response.data)

	cid = response.data.result

	// Wait for settle pch
	console.log("##### WAIT FOR PAYMENT CHANNEL STATE #####")
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log(response.data)
	// End - Wait for settle pch





	console.log("////////////////////////////////////////////////////////")
	console.log("//")
	console.log("// Collect channel")
	console.log("//")
	console.log("////////////////////////////////////////////////////////\n")

	// Get nonce
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	nonce = response.data.result
	console.log("nonce = "+nonce)
	// End - Get nonce

	 
	collect_paych_message = filecoin_signer.collectPymtChan(PAYMENT_CHANNEL_ADDRESS, "t137sjdbgunloi7couiy4l5nc7pd6k2jmq32vizpy", nonce)

	console.log("collect_paych_message:" + collect_paych_message)

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, privateKey));

	console.log(signedMessage)
	  
	console.log("##### COLLECTE PAYMENT CHANNEL #####")
	  
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log(response.data)
	cid = response.data.result

	// Wait for collect pch
	console.log("##### WAIT FOR PAYMENT CHANNEL STATE #####")
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log(response.data)
	// End - Wait for collect pch
}

f()
