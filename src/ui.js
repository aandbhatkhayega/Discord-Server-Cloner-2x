const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { middlemanBannerUrl, manualLtcDepositAddress } = require('./config');

const THEME_COLOR = 0x9b59b6; // purple

function ticketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle('Middleman Escrow - Open a Ticket')
    .setDescription('Use the button below to open a Middleman Escrow ticket. You will be asked for the dealer\'s Discord ID in a modal.')
    .setImage(middlemanBannerUrl || null)
    .setFooter({ text: 'No emojis. Professional UI.' });
}

function ticketPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Escrow Ticket').setStyle(ButtonStyle.Primary)
  );
}

function dealerModal() {
  const modal = new ModalBuilder().setCustomId('dealer_modal').setTitle('Start Escrow');
  const dealerId = new TextInputBuilder()
    .setCustomId('dealer_id')
    .setLabel('Dealer\'s Discord ID (numbers)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(dealerId);
  modal.addComponents(row);
  return modal;
}

function baseTicketEmbed(ticketChannel, sellerId) {
  return new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle('Escrow Ticket')
    .setDescription('Assign participants, set the LTC amount, then proceed to deposit. All events are logged.')
    .addFields(
      { name: 'Ticket Channel', value: `<#${ticketChannel}>`, inline: true },
      { name: 'Seller (Dealer)', value: sellerId ? `<@${sellerId}>` : 'Not set', inline: true },
      { name: 'Buyer', value: 'Not set', inline: true },
    )
    .setImage(middlemanBannerUrl || null);
}

function partyAssignButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('assign_seller').setLabel('Set Seller').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('assign_buyer').setLabel('Set Buyer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('confirm_parties').setLabel('Confirm Parties').setStyle(ButtonStyle.Primary)
  );
}

function selectUserModal(kind) {
  const modal = new ModalBuilder().setCustomId(`select_${kind}_modal`).setTitle(`Set ${kind === 'seller' ? 'Seller' : 'Buyer'}`);
  const userId = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel(`${kind === 'seller' ? 'Seller' : 'Buyer'} Discord ID`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(userId);
  modal.addComponents(row);
  return modal;
}

function amountModal() {
  const modal = new ModalBuilder().setCustomId('amount_modal').setTitle('Set LTC Amount');
  const amount = new TextInputBuilder()
    .setCustomId('amount_ltc')
    .setLabel('Enter LTC Amount (e.g., 1.25)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(amount);
  modal.addComponents(row);
  return modal;
}

function amountButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('set_amount').setLabel('Set Amount').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('confirm_amount').setLabel('Confirm Amount').setStyle(ButtonStyle.Primary)
  );
}

function depositEmbed({ address, amountLtc }) {
  const e = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle('Escrow Deposit')
    .setDescription('Send the LTC to the escrow deposit address. Provide the TXID after sending.')
    .addFields(
      { name: 'Deposit Address', value: `
```
${address}
````, inline: false },
      amountLtc ? { name: 'Amount (LTC)', value: `${amountLtc}`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
    )
    .setImage(middlemanBannerUrl || null);
  return e;
}

function depositButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('copy_address').setLabel('Copy Address').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('show_qr').setLabel('Show QR').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('set_txid').setLabel('Set TXID').setStyle(ButtonStyle.Primary)
  );
}

function txidModal() {
  const modal = new ModalBuilder().setCustomId('txid_modal').setTitle('Provide TXID');
  const tx = new TextInputBuilder()
    .setCustomId('txid')
    .setLabel('Transaction ID (TXID)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(tx);
  modal.addComponents(row);
  return modal;
}

function adminButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_confirm_deposit').setLabel('Admin: Confirm Deposit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin_release').setLabel('Admin: Release LTC').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin_cancel').setLabel('Admin: Cancel Deal').setStyle(ButtonStyle.Danger),
  );
}

function supportButtons(adminRoleId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('contact_support').setLabel('Contact Support').setStyle(ButtonStyle.Secondary)
  );
}

function payoutButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('set_payout_address').setLabel('Set Payout Address').setStyle(ButtonStyle.Secondary)
  );
}

function payoutModal() {
  const modal = new ModalBuilder().setCustomId('payout_modal').setTitle('Set Payout Address (Seller)');
  const addr = new TextInputBuilder()
    .setCustomId('payout_address')
    .setLabel('Litecoin address to receive release')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const row = new ActionRowBuilder().addComponents(addr);
  modal.addComponents(row);
  return modal;
}

function releasedEmbed(toUserId, txid) {
  return new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle('Escrow Released')
    .setDescription(`Funds released to <@${toUserId}>`) 
    .addFields(txid ? [{ name: 'Release TXID', value: txid }] : [])
    .setImage(middlemanBannerUrl || null);
}

function cancelledEmbed(reason) {
  return new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle('Escrow Cancelled')
    .setDescription(reason || 'The deal has been cancelled.')
    .setImage(middlemanBannerUrl || null);
}

module.exports = {
  ticketPanelEmbed,
  ticketPanelButtons,
  dealerModal,
  baseTicketEmbed,
  partyAssignButtons,
  selectUserModal,
  amountModal,
  amountButtons,
  depositEmbed,
  depositButtons,
  txidModal,
  adminButtons,
  supportButtons,
  payoutButtons,
  payoutModal,
  releasedEmbed,
  cancelledEmbed,
  THEME_COLOR,
};
