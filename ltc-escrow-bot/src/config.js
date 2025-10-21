require('dotenv').config();

const requiredEnv = [
  'DISCORD_TOKEN',
  'GUILD_ID',
  'ESCROW_CATEGORY_ID',
  'TICKET_LOG_CHANNEL_ID',
  'ADMIN_ROLE_ID',
  'MIDDLEMAN_BANNER_URL',
  'MANUAL_LTC_DEPOSIT_ADDRESS',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`[config] Missing env var ${key}.`);
  }
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  escrowCategoryId: process.env.ESCROW_CATEGORY_ID,
  ticketLogChannelId: process.env.TICKET_LOG_CHANNEL_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID,
  middlemanBannerUrl: process.env.MIDDLEMAN_BANNER_URL,
  manualLtcDepositAddress: process.env.MANUAL_LTC_DEPOSIT_ADDRESS,
};
