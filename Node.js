const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');

// تنظیمات اولیه
const networks = {
  ethereum: {
    rpc: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    scan: 'https://etherscan.io',
    chainId: 1
  },
  bsc: {
    rpc: 'https://bsc-dataseed.binance.org/',
    scan: 'https://bscscan.com',
    chainId: 56
  },
  polygon: {
    rpc: 'https://polygon-rpc.com',
    scan: 'https://polygonscan.com',
    chainId: 137
  },
  base: {
    rpc: 'https://mainnet.base.org',
    scan: 'https://basescan.org',
    chainId: 8453
  }
};

// ذخیره موقت داده‌ها (در محیط واقعی از یک ذخیره‌سازی امن استفاده کنید)
let userData = {
  privateKey: null,
  destinationWallet: null,
  monitoringWallets: {
    ethereum: null,
    bsc: null,
    polygon: null,
    base: null
  },
  isRunning: false
};

// تنظیم ربات تلگرام
const token = '7684165123:AAEP9RDSFpGP9jm-eaDkB4lv81pv5m6qRyo';
const bot = new TelegramBot(token, {polling: true});

// دستورات ربات
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'به ربات انتقال خودکار ارز دیجیتال خوش آمدید!\nلطفا کلید خصوصی کیف پول خود را ارسال کنید (این اطلاعات ذخیره نمی‌شوند):');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userData.privateKey && !text.startsWith('/')) {
    userData.privateKey = text;
    bot.sendMessage(chatId, 'کلید خصوصی دریافت شد. لطفا آدرس کیف پول مقصد را ارسال کنید:');
    return;
  }

  if (!userData.destinationWallet && userData.privateKey && !text.startsWith('/')) {
    userData.destinationWallet = text;
    bot.sendMessage(chatId, 'آدرس مقصد دریافت شد. لطفا آدرس کیف پول‌هایی که باید رصد شوند را به این صورت ارسال کنید:\n\n/addresses ETH_Address BSC_Address POLYGON_Address BASE_Address');
    return;
  }

  if (text.startsWith('/addresses')) {
    const addresses = text.split(' ').slice(1);
    if (addresses.length === 4) {
      userData.monitoringWallets.ethereum = addresses[0];
      userData.monitoringWallets.bsc = addresses[1];
      userData.monitoringWallets.polygon = addresses[2];
      userData.monitoringWallets.base = addresses[3];
      
      bot.sendMessage(chatId, 'آدرس‌ها با موفقیت ثبت شدند. برای شروع رصد و انتقال خودکار از دستور /run استفاده کنید.');
    } else {
      bot.sendMessage(chatId, 'فرمت آدرس‌ها نادرست است. لطفا 4 آدرس را به ترتیب ETH, BSC, POLYGON, BASE ارسال کنید.');
    }
    return;
  }

  if (text === '/run') {
    if (!userData.isRunning) {
      userData.isRunning = true;
      startMonitoring();
      bot.sendMessage(chatId, 'ربات شروع به کار کرد. انتقال‌ها به صورت خودکار انجام خواهند شد.');
    } else {
      bot.sendMessage(chatId, 'ربات در حال حاضر در حال اجراست.');
    }
    return;
  }

  if (text === '/stop') {
    userData.isRunning = false;
    bot.sendMessage(chatId, 'ربات متوقف شد.');
    return;
  }

  if (text === '/status') {
    const status = userData.isRunning ? 'در حال اجرا' : 'متوقف';
    bot.sendMessage(chatId, `وضعیت ربات: ${status}\nآدرس مقصد: ${userData.destinationWallet}`);
    return;
  }
});

// تابع شروع رصد کیف پول‌ها
function startMonitoring() {
  if (!userData.isRunning) return;

  // رصد هر 30 میلی‌ثانیه
  setInterval(() => {
    checkAndTransfer('ethereum');
    checkAndTransfer('bsc');
    checkAndTransfer('polygon');
    checkAndTransfer('base');
  }, 30);
}

// تابع بررسی موجودی و انتقال
async function checkAndTransfer(network) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(networks[network].rpc);
    const wallet = new ethers.Wallet(userData.privateKey, provider);
    const sourceAddress = userData.monitoringWallets[network];
    
    if (!sourceAddress) return;

    // بررسی موجودی
    const balance = await provider.getBalance(sourceAddress);
    if (balance.gt(0)) {
      // محاسبه کارمزد تخمینی
      const gasPrice = await provider.getGasPrice();
      const gasLimit = 21000; // حد استاندارد برای انتقال ETH/BNB/MATIC
      const fee = gasPrice.mul(gasLimit);
      
      // مقدار قابل انتقال (موجودی - کارمزد)
      const transferAmount = balance.sub(fee);
      
      if (transferAmount.gt(0)) {
        // ایجاد و ارسال تراکنش
        const tx = {
          to: userData.destinationWallet,
          value: transferAmount,
          gasPrice: gasPrice,
          gasLimit: gasLimit,
          chainId: networks[network].chainId
        };
        
        const txResponse = await wallet.sendTransaction(tx);
        console.log(`Transfer ${network}: ${txResponse.hash}`);
        
        // اطلاع به کاربر از طریق تلگرام
        bot.sendMessage(
          chatId,
          `انتقال انجام شد!\nشبکه: ${network}\nمبلغ: ${ethers.utils.formatEther(transferAmount)}\nتراکنش: ${networks[network].scan}/tx/${txResponse.hash}`
        );
      }
    }
  } catch (error) {
    console.error(`Error in ${network} transfer:`, error);
    bot.sendMessage(chatId, `خطا در انتقال ${network}: ${error.message}`);
  }
}

// شروع برنامه
console.log('Bot is running...');
