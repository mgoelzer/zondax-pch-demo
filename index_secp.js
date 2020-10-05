const dotenv = require('dotenv').config();
const filecoin_signer = require('../filecoin-signing-tools/signer-npm/pkg/nodejs');
const bip39 = require('bip39');
const bip32 = require('bip32');
const axios = require('axios');
const secp256k1 = require('secp256k1');
const cbor = require("ipld-dag-cbor").util;
const util = require("util");
const chalk = require('chalk');
const prompt = require('prompt-sync')();

// TODO:  
// 1.  get rid of key wrangling section
// 2.  derive from address from private key and assert that it's equal to from address const
// 3.  get rid of key wranglign section
// 4.  verify that voucher is correct
// 5.  to address needs to be BLS

const to_addr = "t1imp6nxsewebbjieqzhra4rduuaqxsgx5o2zgr6a"
//const from_addr = "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta"

const privateKeyBase64 = process.env.PRIVATE_KEY_BASE64
const privateKey = Buffer.from(privateKeyBase64, 'base64')
const LOTUS_API_TOKEN = process.env.LOTUS_API_TOKEN


const headers = { "Authorization": `Bearer ${LOTUS_API_TOKEN}` }

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

	let create_pymtchan = filecoin_signer.createPymtChan(recoveredKey.address, "t1imp6nxsewebbjieqzhra4rduuaqxsgx5o2zgr6a", "1000", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

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

	const VOUCHER_SIGNER_2 = privateKeyBase64
	let voucher = filecoin_signer.createVoucher(PCH, BigInt(0), BigInt(0), "250", BigInt(0), BigInt(nonce), BigInt(0))

	console.log(">> voucher: " + util.inspect(voucher))

	let signedVoucher = filecoin_signer.signVoucher(voucher, VOUCHER_SIGNER_2)

	// This is what to convert to hex and plug into cbor.me to view
	console.log(">> signed voucher: " + util.inspect(signedVoucher))

	let tmp = cbor.deserialize(Buffer.from(signedVoucher, 'base64'))
	//console.log(">> signedVoucher (base64): " + Buffer.from(tmp).slice(1).toString('base64'))

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


	let update_paych_message = filecoin_signer.updatePymtChan(PCH, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", signedVoucher, nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

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
	  params: [PCH, null]
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

	settle_paych_message = filecoin_signer.settlePymtChan(PCH, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium)

	console.log(">> settle paych message = "+util.inspect(settle_paych_message))

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(settle_paych_message, privateKey));
	  
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
	  params: [PCH, null]
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

	collect_paych_message = filecoin_signer.collectPymtChan(PCH, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

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
          params: [PCH, null]
        }, { headers })
        console.log("post-collect pch state response.data = "+ util.inspect(response.data))

}

f()
