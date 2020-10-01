const filecoin_signer = require('@zondax/filecoin-signing-tools');
const bip39 = require('bip39');
const bip32 = require('bip32');
const axios = require('axios');
const secp256k1 = require('secp256k1');
const cbor = require("ipld-dag-cbor").util;
const util = require("util");
const chalk = require('chalk');
const prompt = require('prompt-sync')();

const privateKeyBase64 = "uGOBUfBGpxu3jVGdJFbUiyPH53GLVAbG6wdBG4/fl9g="
const privateKey = Buffer.from(privateKeyBase64, 'base64')
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJBbGxvdyI6WyJyZWFkIiwid3JpdGUiLCJzaWduIiwiYWRtaW4iXX0.K7ETGuBkWqCxw-5EOCxJLtpWcL3w1MywGBR1Gg7Uj4c"

const headers = { "Authorization": `Bearer ${TOKEN}` }

const URL = "http://192.168.1.23:1234/rpc/v0"

f = async () => {
	console.log(chalk.blueBright("\n////////////////////////////////////////////////////////"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("// Key wrangling"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("////////////////////////////////////////////////////////\n"))
	// Generate pkey from constant key above
	let recoveredKey = filecoin_signer.keyRecover(privateKeyBase64, true);
	console.log(">> recovered key = "+recoveredKey.address)
	let address = recoveredKey.address

	console.log(">> recovered key = "+recoveredKey.address)
	console.log(">> address = "+address+"\n")


	console.log(chalk.blueBright("////////////////////////////////////////////////////////"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("// PCH creation"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("////////////////////////////////////////////////////////\n"))

	// Get nonce
	console.log(chalk.greenBright("\n######## GET NONCE ########"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	console.log("response.data = "+util.inspect(response.data))
	nonce = response.data.result
	console.log(">> nonce = "+nonce+"\n")
	// End - get nonce

	let PAYMENT_CHANNEL_ADDRESS = "t01010"
	let create_pymtchan = filecoin_signer.createPymtChan(recoveredKey.address, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", "1000", nonce)

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(create_pymtchan, privateKey));

	console.log(">> pch create signedMessage: "+util.inspect(signedMessage))

      	console.log(chalk.greenBright("\n##### MPOOLPUSH CREATE PAYMENT CHANNEL #####"))
      
      	response = await axios.post(URL, {
        	jsonrpc: "2.0",
        	method: "Filecoin.MpoolPush",
        	id: 1,
       	params: [signedMessage]
      	}, { headers })

      	console.log("mpoolpush create response.data="+util.inspect(response.data))
	cid = response.data.result
	console.log(">> message CID="+util.inspect(cid)+"\n")


	// Wait for PCH
	console.log(chalk.greenBright("\n##### WAIT PAYMENT CHANNEL CREATE #####"))
	response = await axios.post(URL, {
		jsonrpc: "2.0",
		method: "Filecoin.StateWaitMsg",
		id: 1,
		params: [cid, null]
	}, { headers })
	
	console.log("response.data: " + util.inspect(response.data))
	PCH = response.data.result.ReturnDec.IDAddress
	PCHRobust = response.data.result.ReturnDec.RobustAddress
	console.log(">> PCH Id Address = "+PCH)
	console.log(">> PCH Robust Address = "+PCHRobust+"\n")
	// End - Wait for PCH

	prompt('Press ENTER to continue...')

	console.log(chalk.blueBright("////////////////////////////////////////////////////////"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("// Sign and send voucher"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("////////////////////////////////////////////////////////\n"))

	const VOUCHER_SIGNER_2 = privateKeyBase64 // key for `t3ucc7cbh...` addr
	let voucher = filecoin_signer.createVoucher(PAYMENT_CHANNEL_ADDRESS, BigInt(0), BigInt(0), "250", BigInt(0), BigInt(nonce), BigInt(0))

	let signedVoucher = filecoin_signer.signVoucher(voucher, VOUCHER_SIGNER_2)

	let tmp = cbor.deserialize(Buffer.from(signedVoucher, 'base64'))[10]
	console.log(">> signedVoucher (base64): " + Buffer.from(tmp).slice(1).toString('base64'))
	// Discussion 6:  `lotus paych voucher check t2y53bzjfausn6nqmmjfuugrgajw5ynd67y6n5ngi AOByNvdDyag9ys4OCQopJzbNqF6ql6+FU0mjm/ulOrR98E3vZgZBtHY88aUVkqHRtTCbZDY5sY230BAg+dI6RQA=` gives this output:
	// ERROR: illegal base64 data at input byte 30
	// Byte 30 is a 0x0a (line break) character:
	// 00000000: 00e0 7236 f743 c9a8 3dca ce0e 090a 2927  ..r6.C..=.....)'
	// 00000010: 36cd a85e aa97 af85 5349 a39b fba5 3ab4  6..^....SI....:.
	// 00000020: 7df0 4def 6606 41b4 763c f1a5 1592 a1d1  }.M.f.A.v<......
	// 00000030: b530 9b64 3639 b18d b7d0 1020 f9d2 3a45  .0.d69..... ..:E
	// 00000040: 00                                       .

	// TODO:  check voucher validity using filecoin_signer here...
	// Discussion 7:  No method to verify a voucher in signer-npm/js/src/index.js
	// as far as I can tell.

	prompt('Press ENTER to continue...')

	console.log(chalk.blueBright("\n////////////////////////////////////////////////////////"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("// Update channel with signed voucher"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("////////////////////////////////////////////////////////\n"))


	// Get nonce
	console.log(chalk.greenBright("\n######## GET NONCE ########"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	console.log("get nonce response.data = ")+util.inspect(response.data)
	nonce = response.data.result
	console.log(">> nonce = "+nonce+"\n")
	// End - get nonce


	let update_paych_message = filecoin_signer.updatePymtChan(PAYMENT_CHANNEL_ADDRESS, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", signedVoucher, nonce)

	//console.log(">> update_paych_message"+util.inspect(update_paych_message))

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, privateKeyBase64));
	 
	console.log("update paych signedMessage="+util.inspect(signedMessage))
	  
	console.log(chalk.greenBright("\n##### MPOOLPUSH UPDATE CHANNEL #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log("mpoolpush update pch response.data = "+util.inspect(response.data))

	cid = response.data.result

	// Wait for update pch message
	console.log(chalk.greenBright("\n##### WAIT FOR UPDATE PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("update pch response.data = "+util.inspect(response.data))
	// End - Wait for update pch message

	console.log(chalk.greenBright("\n##### READ POST-UPDATE PAYMENT CHANNEL STATE #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PAYMENT_CHANNEL_ADDRESS, null]
	}, { headers })
	console.log("mpoolpush pch response.data = "+util.inspect(response.data))

	prompt('Press ENTER to continue...')

	console.log(chalk.blueBright("////////////////////////////////////////////////////////"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("// Settle channel"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("////////////////////////////////////////////////////////\n"))

	// Get nonce
	console.log(chalk.greenBright("\n######## GET NONCE ########"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	console.log("response.data = ")+util.inspect(response.data)
	nonce = response.data.result
	console.log(">> nonce = "+nonce+"\n")
	// End - get nonce

	update_paych_message = filecoin_signer.settlePymtChan(PAYMENT_CHANNEL_ADDRESS, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", nonce)

	console.log(">> update paych message = "+util.inspect(update_paych_message))

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, privateKey));
	  
	console.log(">> update pch signedMessage = "+util.inspect(signedMessage)+"\n")
	  
	console.log(chalk.greenBright("\n##### MPOOLPUSH SETTLE PAYMENT CHANNEL #####"))
	  
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })

	console.log("mpoolpush settle response.data = "+util.inspect(response.data))

	cid = response.data.result

	// Wait for settle pch
	console.log(chalk.greenBright("\n##### WAIT FOR SETTLE PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("settle pch response.data = "+util.inspect(response.data))
	// End - Wait for settle pch


	console.log(chalk.greenBright("\n##### READ POST-SETTLE PAYMENT CHANNEL STATE #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PAYMENT_CHANNEL_ADDRESS, null]
	}, { headers })
	console.log("post-settle pch state response.data = "+util.inspect(response.data))

	prompt('Press ENTER to continue...')

	console.log(chalk.blueBright("\n////////////////////////////////////////////////////////"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("// Collect channel"))
	console.log(chalk.blueBright("//"))
	console.log(chalk.blueBright("////////////////////////////////////////////////////////\n"))

	// Get nonce
	console.log(chalk.greenBright("\n######## GET NONCE ########"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolGetNonce",
	  id: 1,
	  params: [address]
	}, {headers})
	console.log("get nonce response.data = "+util.inspect(response.data))
	nonce = response.data.result
	console.log(">> nonce = "+nonce+"\n")
	// End - get nonce

	collect_paych_message = filecoin_signer.collectPymtChan(PAYMENT_CHANNEL_ADDRESS, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", nonce)

	//console.log("collect_paych_message:" + util.inspect(collect_paych_message))

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(collect_paych_message, privateKey));

	console.log("collect pch signedMessage:"+util.inspect(signedMessage))
	  
	console.log(chalk.greenBright("\n##### MPOOLPUSH COLLECT PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log("collect mpoolpush response.data = "+util.inspect(response.data))
	cid = response.data.result

	// Wait for collect pch
	console.log(chalk.greenBright("\n##### WAIT FOR COLLECT PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("collect wait response.data = "+util.inspect(response.data))
	// End - Wait for collect pch

        console.log(chalk.greenBright("\n##### READ POST-COLLECT PAYMENT CHANNEL STATE #####"))
        response = await axios.post(URL, {
          jsonrpc: "2.0",
          method: "Filecoin.StateReadState",
          id: 1,
          params: [PAYMENT_CHANNEL_ADDRESS, null]
        }, { headers })
        console.log("post-collect pch state response.data = "+ util.inspect(response.data))

}

f()
