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
		//console.log(chalk.blueBright("\n>>> Get Nonce <<<"))
		response = await axios.post(URL, {
		  jsonrpc: "2.0",
		  method: "Filecoin.MpoolGetNonce",
		  id: 1,
		  params: [addr]
		}, {headers})
		//console.log("response.data = "+util.inspect(response.data))
		nonce = response.data.result
		//console.log(`Nonce (${addr}) = ${nonce}\n`)
		return nonce
		// End - get nonce
	}

	/////////////////////////////////////////////////////////////////////
	//
	// Generate To and From public keys from private keys in .env
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("######## DERIVE FROM AND TO ADDRESSES ######## "))
	
	const fromAddrPrivateKeyBase64 = process.env.FROM_PRIVATE_KEY_BASE64
	const fromAddrPrivateKey = Buffer.from(fromAddrPrivateKeyBase64, 'base64')
	let recoveredKeyFrom = filecoin_signer.keyRecover(fromAddrPrivateKeyBase64, true);
	const fromAddr = recoveredKeyFrom.address

	const toAddrPrivateKeyBase64 = process.env.TO_PRIVATE_KEY_BASE64
	const toAddrPrivateKey = Buffer.from(toAddrPrivateKeyBase64, 'base64')
	let recoveredKeyTo = filecoin_signer.keyRecover(toAddrPrivateKeyBase64, true);
	const toAddr = recoveredKeyTo.address

	console.log(`fromAddr = ${fromAddr}`)
	console.log(`toAddr = ${toAddr}`)

	prompt("\nPress ENTER to continue...")

	/////////////////////////////////////////////////////////////////////
	//
	// Create PCH
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n######## CREATE PAYMENT CHANNEL ######## "))

	nonce = await getNonce(fromAddr)
	let create_pymtchan = filecoin_signer.createPymtChan(fromAddr, toAddr, "1000", nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(create_pymtchan, fromAddrPrivateKey));

	console.log(chalk.blueBright("\n>>> Create Channel Signed Message <<<"))
	console.log(util.inspect(signedMessage))

    console.log(chalk.blueBright("\n>>> MpoolPush Create Payment Channel <<<"))
      
	response = await axios.post(URL, {
		jsonrpc: "2.0",
		method: "Filecoin.MpoolPush",
		id: 1,
	params: [signedMessage]
	}, { headers })

    console.log("response:\n"+util.inspect(response.data))
	cid = response.data.result
	//console.log(">> message CID="+util.inspect(cid)+"\n")


	// Wait for PCH
	console.log(chalk.blueBright("\n>>> Wait for Payment Channel Create <<<"))
	response = await axios.post(URL, {
		jsonrpc: "2.0",
		method: "Filecoin.StateWaitMsg",
		id: 1,
		params: [cid, null]
	}, { headers })
	
	console.log("response:\n" + util.inspect(response.data))
	PCH = response.data.result.ReturnDec.IDAddress
	PCHRobust = response.data.result.ReturnDec.RobustAddress
	console.log("")
	console.log(">> PCH Id Address = "+PCH)
	console.log(">> PCH Robust Address = "+PCHRobust)
	// End - Wait for PCH

	prompt("\nPress ENTER to continue...")

	/////////////////////////////////////////////////////////////////////
	//
	// Create voucher
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n######## CREATE SIGNED VOUCHER ######## "))

	let voucher = filecoin_signer.createVoucher(PCH, BigInt(0), BigInt(0), "250", BigInt(0), BigInt(nonce), BigInt(0))
	//console.log(">> unsigned voucher: " + util.inspect(voucher))
	let signedVoucher = filecoin_signer.signVoucher(voucher, fromAddrPrivateKeyBase64)

	// This is what to convert to hex and plug into cbor.me to view
	console.log("signed voucher: " + util.inspect(signedVoucher))

	// TODO:  check voucher validity using filecoin_signer here...
	// Discussion 7:  No method to verify a voucher in signer-npm/js/src/index.js
	// as far as I can tell.

	prompt("\nPress ENTER to continue...")

	/////////////////////////////////////////////////////////////////////
	//
	// Update channel with voucher
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n######## UPDATE CHANNEL WITH SIGNED VOUCHER ######## "))

	nonce = await getNonce(toAddr)
	let update_paych_message = filecoin_signer.updatePymtChan(PCH, toAddr, signedVoucher, nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium
	//console.log(">> update_paych_message="+util.inspect(update_paych_message))
	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(update_paych_message, toAddrPrivateKeyBase64));
	console.log("signed message:\n"+util.inspect(signedMessage)+"\n")

	console.log(chalk.blueBright("\n>>> Mpool Push Update Channel <<<"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log("response:\n"+util.inspect(response.data))

	cid = response.data.result

	// Wait for update pch message
	console.log(chalk.blueBright("\n>>> Wait for Update Payment Channel <<<"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("update pch response.data = "+util.inspect(response.data))
	// End - Wait for update pch message

	console.log(chalk.blueBright("\n>>> Read Post-Update Payment Channel State <<<"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PCH, null]
	}, { headers })
	console.log("mpoolpush pch response.data = "+util.inspect(response.data))

	prompt("\nPress ENTER to continue...")

	/////////////////////////////////////////////////////////////////////
	//
	// Settle PCH
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n######## SETTLE CHANNEL ######## \n"))

	nonce = await getNonce(fromAddr)

	settle_paych_message = filecoin_signer.settlePymtChan(PCH, fromAddr, nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium)
	//console.log(">> settle paych message = "+util.inspect(settle_paych_message))
	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(settle_paych_message, fromAddrPrivateKey));
	console.log("signed message:\n"+util.inspect(signedMessage)+"\n")
	  
	console.log(chalk.blueBright("\n>>> MpoolPush Settle Payment Channel <<<"))
	  
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })

	console.log("response:\n"+util.inspect(response.data))

	cid = response.data.result

	// Wait for settle pch
	console.log(chalk.blueBright("\n>>> Wait for Settle Payment Channel <<<"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log("settle pch response.data = "+util.inspect(response.data))
	// End - Wait for settle pch

	console.log(chalk.blueBright("\n>>> Read Post-Settle Payment Channel State <<<"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.StateReadState",
	  id: 1,
	  params: [PCH, null]
	}, { headers })
	console.log("post-settle pch state response.data = "+util.inspect(response.data))

	prompt(chalk.redBright("\nWait 12 hours, then press ENTER to continue..."))

	/////////////////////////////////////////////////////////////////////
	//
	// Collect PCH
	//
	/////////////////////////////////////////////////////////////////////

	console.log(chalk.greenBright("\n######## COLLECT CHANNEL ######## \n"))

	nonce = await getNonce(fromAddr)

	collect_paych_message = filecoin_signer.collectPymtChan(PCH, fromAddr, nonce, "10000000", "16251176117", "140625002") // gas limit, fee cap, premium

	signedMessage = JSON.parse(filecoin_signer.transactionSignLotus(collect_paych_message, fromAddrPrivateKey));

	console.log("signed message:\n"+util.inspect(signedMessage))
	
	console.log(chalk.blueBright("\n>>> MpoolPush Collect Payment Channel <<<"))
	response = await axios.post(URL, {
	  jsonrpc: "2.0",
	  method: "Filecoin.MpoolPush",
	  id: 1,
	  params: [signedMessage]
	}, { headers })
	console.log("collect mpoolpush response.data = "+util.inspect(response.data))
	cid = response.data.result

	// Wait for collect pch
	console.log(chalk.blueBright("\n>>> Wait for Collect Payment Channel <<<"))
	response = await axios.post(URL, {
	    jsonrpc: "2.0",
	    method: "Filecoin.StateWaitMsg",
	    id: 1,
	    params: [cid, null]
	  }, { headers })
	console.log(util.inspect(response.data))
	// End - Wait for collect pch

	console.log(chalk.blueBright("\n>>> Read Post-Collect Payment Channel State <<<"))
	response = await axios.post(URL, {
		jsonrpc: "2.0",
		method: "Filecoin.StateReadState",
		id: 1,
		params: [PCH, null]
	}, { headers })
	console.log(util.inspect(response.data))

}

f()
