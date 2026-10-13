// UNIQUE BANK SYSTEM

const { MongoClient } = require("mongodb");

const inquirer = require("inquirer");

const bcrypt = require("bcrypt");

require("dotenv").config();

// ─── DATABASE CONNECTION ────────────

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";

const client = new MongoClient(uri);

let db;
let accounts;

// ─VALIDATE ACCOUNT NUMBER ──────

const validateAccountNumber = (input) => {
  // Using a regular expression to test: ^ means start, \d{10} means exactly 10 digits, $ means end
  if (!/^\d{10}$/.test(input.trim())) return "Account number must be exactly 10 digits";
  return true;

};

// ─── HELPER: DAILY LIMIT CHECK ──────

const checkDailyLimit = async (accountNumber, amount, type) => {

  const account = await accounts.findOne({ accountNumber });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dailyTotal = 0;

  for (let i = 0; i < account.transactions.length; i++) {
    const txn = account.transactions[i];

    const txnDate = new Date(txn.date);
    const happenedToday = txnDate >= today;

    let isRightType = false;

    if (type === "withdraw") {
      if (txn.type === "withdraw" || txn.type === "transfer-out") {
        isRightType = true;
      }
    } else {
      if (txn.type === "deposit" || txn.type === "transfer-in") {
        isRightType = true;
      }
    }

    if (happenedToday && isRightType) {
      dailyTotal = dailyTotal + txn.amount;
    }
  }

  let limit = 0;
  if (type === "withdraw") {
    limit = 5000000;   
  } else {
    limit = 10000000;  
  }

  if (dailyTotal + amount > limit) {
    throw new Error(`Daily ${type} limit (₦${limit.toLocaleString()}) exceeded`);
  }

};
// ───  PAUSE: Enter ────

const pause = async () => {
  await inquirer.prompt([{
    type: "input",         
    name: "continue",      
    message: "Press ENTER to continue", 
  }]);
};

// ─── GENERATE UNIQUE ACCOUNT NUMBER ────────

const generateUniqueAccountNumber = async () => {
  while (true) {
    // Generate a random number between 1,000,000,000 and 9,999,999,999, then convert to string
    const accountNumber = Math.floor(
      1000000000 + Math.random() * 9000000000
    ).toString();
    const existing = await accounts.findOne({ accountNumber });
    if (!existing) return accountNumber;
  }
};

// ─── GENERATE UNIQUE BVN ────────

const generateUniqueBVN = async () => {
  while (true) {
    const bvn = Math.floor(
      10000000000 + Math.random() * 90000000000
    ).toString();
    const existing = await accounts.findOne({ bvn });
    if (!existing) return bvn;
  }
};

// ─── WELCOME SCREEN ───────

const showWelcome = () => {
  console.log(`
                                                  
     UNIQUE BANK - SECURE BANKING SYSTEM        
            Your Trusted Partner                
                 BY BEAUTY                     

  `);
};

// ─── MAIN MENU ────────

const showMenu = async () => {
  let running = true;

  while (running) {
    console.clear();
    showWelcome();

    const { action } = await inquirer.prompt([{
      type: "list",
      name: "action",
      message: "Select option",
      choices: [
        { name: "Create Account",      value: "create"    },
        { name: "Deposit Money",       value: "deposit"   },
        { name: "Withdraw Money",      value: "withdraw"  },
        { name: "Transfer Money",      value: "transfer"  },
        { name: "Check Balance",       value: "balance"   },
        { name: "Transaction History", value: "history"   },
        { name: "Generate Statement",  value: "statement" },
        { name: "Exit",                value: "exit"      },
      ],
    }]);

    try {
      switch (action) {
        case "create":    await createAccount(); break;          // Go to account creation
        case "deposit":   await deposit(); break;                // Go to deposit flow
        case "withdraw":  await withdraw(); break;               // Go to withdrawal flow
        case "transfer":  await transfer(); break;               // Go to transfer flow
        case "balance":   await checkBalance(); break;           // Go to balance check
        case "history":   await viewTransactionHistory(); break; // Go to history viewer
        case "statement": await generateStatement(); break;      // Go to statement generator
        case "exit":
          console.log("\nGoodbye! Thank you for banking with Unique Bank.\n");
          await client.close();
          process.exit(0);
      }
    } catch (error) {
      console.log(`\n Something went wrong: ${error.message}\n`);
    }

    await pause();
  }
};
// ─── AUTHENTICATION ─────

const authenticateUser = async (accountNumber) => {
  const account = await accounts.findOne({ accountNumber: accountNumber.trim() });

  if (!account) {
    console.log("\n Account not found.\n");
    return null; 
  }

  if (account.status !== "active") {
    console.log("\n This account is blocked. Contact support.\n");
    return null; 
  }

  // Ask the user to type their PIN — mask hides each character with a *
  const { pin } = await inquirer.prompt([{
    type: "password",  
    name: "pin",      
    message: "Enter PIN",
    mask: "*",         
    validate: (input) => {
      if (input.length !== 4) return "PIN must be exactly 4 digits";
      if (isNaN(input)) return "PIN must be numbers only";
      return true;
    },
  }]);

  // Use bcrypt to compare the typed PIN against the hashed PIN stored in the database
  const valid = await bcrypt.compare(pin, account.pin);

  if (!valid) {
    const failedAttempts = (account.failedAttempts || 0) + 1;

    await accounts.updateOne(
      { accountNumber: account.accountNumber }, 
      { $set: { failedAttempts } }              
    );

    if (failedAttempts >= 3) {
      await accounts.updateOne(
        { accountNumber: account.accountNumber },
        { $set: { status: "blocked", failedAttempts: 0 } } 
      );
      console.log("\n Account BLOCKED after 3 failed attempts!\n");
    } else {
      console.log(`\n Wrong PIN (${failedAttempts}/3 attempts)\n`);
    }
    return null;
  }

  await accounts.updateOne(
    { accountNumber: account.accountNumber },
    { $set: { failedAttempts: 0 } }
  );

  return account;
};

// ─── CREATE ACCOUNT ─────────────

const createAccount = async () => {
  console.log("\n── Create New Account ──\n");

  const answers = await inquirer.prompt([
    {
      type: "input",          
      name: "name",           
      message: "Full Name",
      validate: (input) => input.trim().length < 3 ? "Name is too short" : true,
    },
    {
  type: "input",
  name: "age",
  message: "Age",
  validate: (input) => {
    const num = Number(input.trim());
    if (isNaN(num)) return "Please enter a number";
    if (!Number.isInteger(num)) return "Age must be a whole number";
    if (num <= 0 || num > 120) return "Invalid age";
    return true;
  },
},
   {
  type: "input",
  name: "dob",
  message: "Date of Birth (DD/MM/YYYY)",
  validate: (input, answers) => {
    const parts = input.split("/");

    if (parts.length !== 3) return "Please use DD/MM/YYYY";

    if (parts.some(isNaN)) return "Date must contain numbers only";

    const day   = Number(parts[0]);
    const month = Number(parts[1]) - 1; 
    const year  = Number(parts[2]);

    const dob = new Date(year, month, day);

    if (
      dob.getFullYear() !== year  ||
      dob.getMonth()    !== month ||
      dob.getDate()     !== day
    ) {
      return "That date does not exist. Please check your date of birth";
    }

    const today = new Date();
    let realAge = today.getFullYear() - dob.getFullYear();

    const birthdayThisYear = new Date(today.getFullYear(), month, day);
    if (today < birthdayThisYear) {
      realAge = realAge - 1; 
    }

    if (realAge !== Number(answers.age)) {
      return `Your date of birth does not match the age you entered (${answers.age}). Please check again`;
    }

    return true;
  },
},    
{
      type: "password",       
      name: "pin",
      message: "Create a 4-digit PIN",
      mask: "*",
      validate: (input) => {
        if (input.length !== 4) return "PIN must be exactly 4 digits"; 
        if (isNaN(input)) return "PIN must be numbers only";            
        return true;
      },
    },
    {
      type: "password",       
      name: "confirmPin",
      message: "Confirm your PIN",
      mask: "*",
    },
  ]);

  if (answers.pin !== answers.confirmPin) {
    console.log("\n PINs do not match. Please try again.\n");
    return; // Stop here
  }

  const bvn = await generateUniqueBVN();
  const accountNumber = await generateUniqueAccountNumber();
  const hashedPin = await bcrypt.hash(answers.pin, 10);

  const newAccount = {
    name: answers.name.trim(),   
    age: Number(answers.age),         
    dob: answers.dob,            
    bvn,                         
    accountNumber,               
    pin: hashedPin,              
        accountType: Number(answers.age) < 18 ? "Student" : "Savings", 
    balance: 0,                 
    transactions: [],           
    failedAttempts: 0,          
    createdAt: new Date(),      
    status: "active",           
  };

  try {
    await accounts.insertOne(newAccount);
    console.log(`
 Account Created Successfully!

  Name           : ${newAccount.name}
  Account Number : ${accountNumber}
  BVN            : ${bvn}
  Account Type   : ${newAccount.accountType}
  Balance        : ₦0

  Keep your account number, BVN and PIN safe!
    `);
  } catch (error) {
    console.log("\n Account creation failed. Please try again.\n");
    console.error(error.message);
  }
};

// ─── DEPOSIT ─────────

const deposit = async () => {
  console.log("\n── Deposit Money ──\n");

  const { accountNumber } = await inquirer.prompt([{
    type: "input",
    name: "accountNumber",
    message: "Account Number",
    filter: (input) => input.trim(), 
    validate: validateAccountNumber, 
  }]);

  const account = await authenticateUser(accountNumber);
  if (!account) return; 

  const { amount } = await inquirer.prompt([{
    type: "number",
    name: "amount",
    message: "Amount to deposit (₦)",
    validate: (input) => {
      if (isNaN(input) || input <= 0) return "Amount must be greater than zero";
      return true;
    },
  }]);

  try {
    await checkDailyLimit(accountNumber, amount, "deposit");

    const newBalance = account.balance + amount;
    const reference = "DEP" + Date.now();

    await accounts.updateOne(
      { accountNumber: account.accountNumber }, 
      {
        $set: { balance: newBalance }, 
        $push: {
          transactions: {
            type: "deposit",         
            amount,                  
            date: new Date(),        
            balanceAfter: newBalance,
            reference,               
          },
        },
      }
    );

    console.log(`
 Deposit Successful!

  Amount Deposited : ₦${amount.toLocaleString()}
  New Balance      : ₦${newBalance.toLocaleString()}
  Reference        : ${reference}
  `);
  } catch (error) {
    console.log(`\n ${error.message}\n`);
  }
};

// ─── WITHDRAW ─────────────────────────────────────────────────────────────────

const withdraw = async () => {
  console.log("\n── Withdraw Money ──\n");

  const { accountNumber } = await inquirer.prompt([{
    type: "input",
    name: "accountNumber",
    message: "Account Number",
    filter: (input) => input.trim(),  
    validate: validateAccountNumber,  
  }]);

  const account = await authenticateUser(accountNumber);
  if (!account) return;

  const { amount } = await inquirer.prompt([{
    type: "number",
    name: "amount",
    message: "Amount to withdraw (₦)",
    validate: (input) => {
      if (isNaN(input) || input <= 0) return "Amount must be greater than zero";
      return true;
    },
  }]);

  if (amount > account.balance) {
    console.log(`\n Insufficient funds. Balance: ₦${account.balance.toLocaleString()}\n`);
    return; 
  }

  try {
    await checkDailyLimit(accountNumber, amount, "withdraw");

    const newBalance = account.balance - amount;
    const reference = "WD" + Date.now();

    await accounts.updateOne(
      { accountNumber: account.accountNumber },
      {
        $set: { balance: newBalance }, 
        $push: {
          transactions: {
            type: "withdraw",         
            amount,
            date: new Date(),
            balanceAfter: newBalance,
            reference,
          },
        },
      }
    );

    console.log(`
 Withdrawal Successful!

  Amount Withdrawn : ₦${amount.toLocaleString()}
  New Balance      : ₦${newBalance.toLocaleString()}
  Reference        : ${reference}
  `);
  } catch (error) {
    console.log(`\n ${error.message}\n`);
  }
};

// ─── TRANSFER ─────────────────────────────────────────────────────────────────

const transfer = async () => {
  console.log("\n── Transfer Money ──\n");

  const { senderAccountNumber } = await inquirer.prompt([{
    type: "input",
    name: "senderAccountNumber",
    message: "Your Account Number",
    filter: (input) => input.trim(),
    validate: validateAccountNumber, // Must be exactly 10 digits
  }]);

  // Authenticate the sender — exit if authentication fails
  const sender = await authenticateUser(senderAccountNumber);
  if (!sender) return;

  // Ask for the recipient's account number
  const { recipientAccountNumber } = await inquirer.prompt([{
    type: "input",
    name: "recipientAccountNumber",
    message: "Recipient Account Number",
    filter: (input) => input.trim(),
    validate: validateAccountNumber, // Must be exactly 10 digits
  }]);

  // Prevent self-transfer — you can't send money to yourself
  if (recipientAccountNumber === sender.accountNumber) {
    console.log("\n You cannot transfer money to your own account.\n");
    return;
  }

  // check up the recipient's account in the database
  const recipient = await accounts.findOne({ accountNumber: recipientAccountNumber });

  // If no account found with that number, stop
  if (!recipient) {
    console.log("\n Recipient account not found.\n");
    return;
  }

  // If recipient's account is blocked or inactive, stop
  if (recipient.status !== "active") {
    console.log("\n Recipient account is not active.\n");
    return;
  }

  // Show the recipient's name so the sender can confirm they're sending to the right person just like opay does
  console.log(`\n  Sending to: ${recipient.name}\n`);

  //  how much to transfer
  const { amount } = await inquirer.prompt([{
    type: "number",
    name: "amount",
    message: "Amount to transfer (₦)",
    validate: (input) => {
      if (isNaN(input) || input <= 0) return "Amount must be greater than zero";
      return true;
    },
  }]);

  // seeing  the sender has enough funds to cover the transfer
  if (amount > sender.balance) {
    console.log(`\n Insufficient funds. Balance: ₦${sender.balance.toLocaleString()}\n`);
    return;
  }

  // confmaton
  const { confirm } = await inquirer.prompt([{
    type: "confirm",   // Shows a yes/no prompt
    name: "confirm",
    message: `Transfer ₦${amount.toLocaleString()} to ${recipient.name}?`,
    default: false,    // Default is "No" — user must actively say yes
  }]);

  // If user said no, cancel
  if (!confirm) {
    console.log("\nTransfer cancelled.\n");
    return;
  }

  try {
    await checkDailyLimit(senderAccountNumber, amount, "withdraw");

    const senderNewBalance = sender.balance - amount;    
    const recipientNewBalance = recipient.balance + amount; 
    const reference = "TRF" + Date.now();


    const session = client.startSession(); 

    try {
      await session.withTransaction(async () => {
        // Update the SENDER's account: decrease balance, add transfer-out record
        await accounts.updateOne(
          { accountNumber: sender.accountNumber },
          {
            $set: { balance: senderNewBalance }, // Deduct the amount
            $push: {
              transactions: {
                type: "transfer-out",            // Label this as money going out
                amount,
                to: recipient.accountNumber,     // Record who received the money
                date: new Date(),
                balanceAfter: senderNewBalance,
                reference,
              },
            },
          },
          { session } 
        );

        // Update the RECIPIENT's account: increase balance, add transfer-in record
        await accounts.updateOne(
          { accountNumber: recipient.accountNumber },
          {
            $set: { balance: recipientNewBalance }, // Add the amount
            $push: {
              transactions: {
                type: "transfer-in",              // Label this as money coming in
                amount,
                from: sender.accountNumber,       // Record who sent the money
                date: new Date(),
                balanceAfter: recipientNewBalance,
                reference,
              },
            },
          },
          { session } 
        );
      });
    } finally {
      await session.endSession();
    }

    // Print transfer success details
    console.log(`
Transfer Successful!

  Sent To          : ${recipient.name}
  Amount           : ₦${amount.toLocaleString()}
  Your New Balance : ₦${senderNewBalance.toLocaleString()}
  Reference        : ${reference}
  `);
  } catch (error) {
    console.log(`\n ${error.message}\n`);
  }
};

// ─── CHECK BALANCE ────────────────────────────────────────────────────────────

const checkBalance = async () => {
  console.log("\n── Check Balance ──\n");

  // Ask for the account number
  const { accountNumber } = await inquirer.prompt([{
    type: "input",
    name: "accountNumber",
    message: "Account Number",
    filter: (i) => i.trim(),
    validate: validateAccountNumber, // Must be exactly 10 digits
  }]);

  // Authenticate the user — exit if it fails
  const account = await authenticateUser(accountNumber);
  if (!account) return;

  // Display the account summary
  console.log(`
  Account Holder : ${account.name}
  Account Number : ${account.accountNumber}
  Account Type   : ${account.accountType}
  Status         : ${account.status.toUpperCase()} 
   Balance        : ₦${account.balance.toLocaleString()} 

  `);
};

// ─── TRANSACTION HISTORY ──────────────────────────────────────────────────────

const viewTransactionHistory = async () => {
  console.log("\n── Transaction History ──\n");

  // Ask for the account number
  const { accountNumber } = await inquirer.prompt([{
    type: "input",
    name: "accountNumber",
    message: "Account Number",
    filter: (input) => input.trim(),
    validate: validateAccountNumber, // Must be exactly 10 digits
  }]);

  // Authenticate the user
  const account = await authenticateUser(accountNumber);
  if (!account) return;

  // If the account has no transactions at all, inform the user and stop
  if (account.transactions.length === 0) {
    console.log("\nNo transactions found.\n");
    return;
  }

  // Reverse the array so newest transactions appear first, then take the first 10
  const recent = [...account.transactions].reverse().slice(0, 10);
  // The spread [...] creates a copy so we don't mutate the original array

  // Print a header line
  console.log(`\n  Last ${recent.length} transactions for ${account.name}:\n`);
  console.log("  " + "─".repeat(70)); // Print a horizontal divider line

  // Loop through each transaction and print its details
  recent.forEach((txn, i) => {
    // Format the date using the Nigerian locale for readable display
    const date = new Date(txn.date).toLocaleString("en-NG");
    
    // Pad the type label to 12 characters for alignment
    const typeLabel = txn.type.toUpperCase().padEnd(12);
    // Use + for money coming in, - for money going out
    const sign = ["deposit", "transfer-in"].includes(txn.type) ? "+" : "-";

    // Print the transaction type and amount
    console.log(`  ${i + 1}. [${typeLabel}] ${sign}₦${txn.amount.toLocaleString()}`);
    // Print the date of the transaction
    console.log(`     Date    : ${date}`);
    // Print what the balance was immediately after this transaction
    console.log(`     Balance : ₦${txn.balanceAfter.toLocaleString()}`);
    // Print the reference code
    console.log(`     Ref     : ${txn.reference}`);
    // If this was a transfer-out, show who received the money
    if (txn.to)   console.log(`     To      : ${txn.to}`);
    // If this was a transfer-in, show who sent the money
    if (txn.from) console.log(`     From    : ${txn.from}`);
    // Print a divider between transactions
    console.log("  " + "─".repeat(70));
  });
};

// ─── GENERATE STATEMENT ───────────────────────────────────────────────────────

const generateStatement = async () => {
  console.log("\n── Generate Account Statement ──\n");

  // Ask for the account number
  const { accountNumber } = await inquirer.prompt([{
    type: "input",
    name: "accountNumber",
    message: "Account Number",
    filter: (input) => input.trim(),
    validate: validateAccountNumber, // Must be exactly 10 digits
  }]);

  // Authenticate the user
  const account = await authenticateUser(accountNumber);
  if (!account) return;

  // Ask the user how far back they want the statement to go
  const { period } = await inquirer.prompt([{
    type: "list",  // Dropdown list of options
    name: "period",
    message: "Statement period",
    choices: [
      { name: "Last 7 days",  value: 7  },  // Value is a number of days
      { name: "Last 30 days", value: 30 },
      { name: "Last 90 days", value: 90 },
    ],
  }]);

  // Calculate the cutoff date: today's date minus the selected number of days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period); // Go back 'period' days from today

  // Filter transactions to only include ones that happened on or after the cutoff
  const filtered = account.transactions.filter(txn => new Date(txn.date) >= cutoff);

  // If no transactions fall in this period, notify the user and stop
  if (filtered.length === 0) {
    console.log(`\nNo transactions in the last ${period} days.\n`);
    return;
  }

  // Calculate total money IN: sum of all deposits and incoming transfers
  const totalIn = filtered
    .filter(t => ["deposit", "transfer-in"].includes(t.type)) // Only inward transactions
    .reduce((s, t) => s + t.amount, 0); // Add up all amounts

  // Calculate total money OUT: sum of all withdrawals and outgoing transfers
  const totalOut = filtered
    .filter(t => ["withdraw", "transfer-out"].includes(t.type)) // Only outward transactions
    .reduce((s, t) => s + t.amount, 0); // Add up all amounts

  // Print the statement header box
  console.log(`
  
             UNIQUE BANK — STATEMENT              
  

  Account Holder : ${account.name}
  Account Number : ${account.accountNumber}
  Account Type   : ${account.accountType}
  Period         : Last ${period} days
  Generated On   : ${new Date().toLocaleString("en-NG")} 
  ${"─".repeat(52)}
  `);

  // Print each transaction on a single line: date, type, signed amount, reference
  filtered.reverse().forEach((txn) => {
    // Format as a short date only (no time needed in a statement)
    const date = new Date(txn.date).toLocaleDateString("en-NG");
    // + for incoming, - for outgoing
    const sign = ["deposit", "transfer-in"].includes(txn.type) ? "+" : "-";
    // padEnd ensures the type label is always the same width for alignment
    // padStart right-aligns the amount within 14 characters
    console.log(`  ${date}  ${txn.type.padEnd(14)} ${sign}₦${txn.amount.toLocaleString().padStart(14)}  Ref: ${txn.reference}`);
  });

  // Print the summary footer with totals
  console.log(`
  ${"─".repeat(52)}
  Total Money In  : ₦${totalIn.toLocaleString()}
  Total Money Out : ₦${totalOut.toLocaleString()}
  Net Flow        : ₦${(totalIn - totalOut).toLocaleString()} 
  Current Balance : ₦${account.balance.toLocaleString()}
  `);
};

// ─── STARTUP ──────────────────────────────────────────────────────────────────

const main = async () => {
  try {
    await client.connect();
    db = client.db("charmbank");
    accounts = db.collection("accountscreate");
    console.log(" Connected to MongoDB\n");
    await showMenu();
  } catch (error) {
    console.error(" Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
};

main();