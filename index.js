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
// 4.  verify that voucher is correct
// 5.  to address needs to be BLS

const URL = process.env.LOTUS_RPC_URL
const LOTUS_API_TOKEN = process.env.LOTUS_API_TOKEN
const headers = { "Authorization": `Bearer ${LOTUS_API_TOKEN}` }

f = async () => {
	/////////////////////////////////////////////////////////////////////
	//
	//   Helper functions
	//
	/////////////////////////////////////////////////////////////////////
	getNonce = async (addr) => {
		// Get nonce
		console.log(chalk.blueBright("\n######## GET NONCE ########"))
		response = await axios.post(URL, {
		  jsonrpc: "2.0",
		  method: "Filecoin.MpoolGetNonce",
		  id: 1,
		  params: [addr]
		}, {headers})
		//console.log("response.data = "+util.inspect(response.data))
		nonce = response.data.result
		console.log(`Nonce (${addr}) = ${nonce}\n`)
		return nonce
		// End - get nonce
	}

	/////////////////////////////////////////////////////////////////////
	//
	// Generate To and From public keys from private keys in .env
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n ######## Derive From and To Addresses ######## "))
	
	const fromAddrPrivateKeyBase64 = process.env.FROM_PRIVATE_KEY_BASE64
	const fromAddrPrivateKey = Buffer.from(fromAddrPrivateKeyBase64, 'base64')
	let recoveredKeyFrom = filecoin_signer.keyRecover(fromAddrPrivateKeyBase64, true);
	const fromAddr = recoveredKeyFrom.address

	const toAddrPrivateKeyBase64 = process.env.TO_PRIVATE_KEY_BASE64
	const toAddrPrivateKey = Buffer.from(toAddrPrivateKeyBase64, 'base64')
	let recoveredKeyTo = filecoin_signer.keyRecover(toAddrPrivateKeyBase64, true);
	const toAddr = recoveredKeyTo.address

	/////////////////////////////////////////////////////////////////////
	//
	// Create PCH
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n ######## Create Payment Channel ######## "))

	nonce = await getNonce(recoveredKeyFrom.address)
	let create_pymtchan = filecoin_signer.createPymtChan(recoveredKeyFrom.address, "t1imp6nxsewebbjieqzhra4rduuaqxsgx5o2zgr6a", "1000", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(create_pymtchan, fromAddrPrivateKey));
	console.log(">> pch create signedMessage: "+util.inspect(signedMessage))

    console.log(chalk.blueBright("\n##### MPOOLPUSH CREATE PAYMENT CHANNEL #####"))
      
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
	console.log(chalk.blueBright("\n##### WAIT PAYMENT CHANNEL CREATE #####"))
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

	/////////////////////////////////////////////////////////////////////
	//
	// Create voucher
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n ######## Create Signed Voucher ######## "))

	const VOUCHER_SIGNER = fromAddrPrivateKeyBase64
	console.log("Code:  let voucher = filecoin_signer.createVoucher(" + PCH + ", BigInt(0), BigInt(0), \"250\", BigInt(0), BigInt(nonce), BigInt(0))")
	let voucher = filecoin_signer.createVoucher(PCH, BigInt(0), BigInt(0), "250", BigInt(0), BigInt(nonce), BigInt(0))

	console.log(">> unsigned voucher: " + util.inspect(voucher))
	prompt('Press ENTER to continue...')

	console.log("Code:  let signedVoucher = filecoin_signer.signVoucher(voucher, " + VOUCHER_SIGNER + ")")
	let signedVoucher = filecoin_signer.signVoucher(voucher, VOUCHER_SIGNER)

	// This is what to convert to hex and plug into cbor.me to view
	console.log(">> signed voucher: " + util.inspect(signedVoucher))

	//let tmp = cbor.deserialize(Buffer.from(signedVoucher, 'base64'))
	//console.log(">> signedVoucher (cbor deserialized): " + Buffer.from(tmp).slice(1).toString('base64'))
	//console.log(">> signedVoucher (base64): " + Buffer.from(tmp).slice(1).toString('base64'))

	// TODO:  check voucher validity using filecoin_signer here...
	// Discussion 7:  No method to verify a voucher in signer-npm/js/src/index.js
	// as far as I can tell.

	prompt('Press ENTER to continue...')

	/////////////////////////////////////////////////////////////////////
	//
	// Update channel with voucher
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n ######## Update Channel with Signed Voucher ######## "))

	nonce = await getNonce(toAddr)
	let update_paych_message = filecoin_signer.updatePymtChan(PCH, "t1imp6nxsewebbjieqzhra4rduuaqxsgx5o2zgr6a", signedVoucher, nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium
	console.log(">> update_paych_message="+util.inspect(update_paych_message))

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, toAddrPrivateKeyBase64));
	console.log(">> update paych signedMessage="+util.inspect(signedMessage))

	console.log(chalk.blueBright("\n##### MPOOLPUSH UPDATE CHANNEL #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log("mpoolpush update pch response.data = "+util.inspect(response.data))

	cid = response.data.result

	// Wait for update pch message
	console.log(chalk.blueBright("\n##### WAIT FOR UPDATE PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("update pch response.data = "+util.inspect(response.data))
	// End - Wait for update pch message

	console.log(chalk.blueBright("\n##### READ POST-UPDATE PAYMENT CHANNEL STATE #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PCH, null]
	}, { headers })
	console.log("mpoolpush pch response.data = "+util.inspect(response.data))

	prompt('Press ENTER to continue...')

	/////////////////////////////////////////////////////////////////////
	//
	// Settle PCH
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n ######## Settle Channel ######## "))

	nonce = await getNonce(recoveredKeyFrom.address)

	settle_paych_message = filecoin_signer.settlePymtChan(PCH, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium)

	console.log(">> settle paych message = "+util.inspect(settle_paych_message))

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(settle_paych_message, fromAddrPrivateKey));
	  
	console.log(">> update pch signedMessage = "+util.inspect(signedMessage)+"\n")
	  
	console.log(chalk.blueBright("\n##### MPOOLPUSH SETTLE PAYMENT CHANNEL #####"))
	  
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })

	console.log("mpoolpush settle response.data = "+util.inspect(response.data))

	cid = response.data.result

	// Wait for settle pch
	console.log(chalk.blueBright("\n##### WAIT FOR SETTLE PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("settle pch response.data = "+util.inspect(response.data))
	// End - Wait for settle pch

	console.log(chalk.blueBright("\n##### READ POST-SETTLE PAYMENT CHANNEL STATE #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PCH, null]
	}, { headers })
	console.log("post-settle pch state response.data = "+util.inspect(response.data))

	prompt('Press ENTER to continue...')

	/////////////////////////////////////////////////////////////////////
	//
	// Collect PCH
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n ######## Collect Channel ######## "))

	nonce = await getNonce(recoveredKeyFrom.address)

	collect_paych_message = filecoin_signer.collectPymtChan(PCH, "t1a25ihzpz7jb6wgjkkd7cndnhgo4zbbap6jc5pta", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(collect_paych_message, fromAddrPrivateKey));

	console.log("collect pch signedMessage:"+util.inspect(signedMessage))
	
	console.log(chalk.blueBright("\n##### MPOOLPUSH COLLECT PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log("collect mpoolpush response.data = "+util.inspect(response.data))
	cid = response.data.result

	// Wait for collect pch
	console.log(chalk.blueBright("\n##### WAIT FOR COLLECT PAYMENT CHANNEL #####"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("collect wait response.data = "+util.inspect(response.data))
	// End - Wait for collect pch

	console.log(chalk.blueBright("\n##### READ POST-COLLECT PAYMENT CHANNEL STATE #####"))
	response = await axios.post(URL, {
		jsonrpc: "2.0",
		method: "Filecoin.StateReadState",
		id: 1,
		params: [PCH, null]
	}, { headers })
	console.log("post-collect pch state response.data = "+ util.inspect(response.data))

}

f()
