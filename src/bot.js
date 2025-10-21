const { Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QRCode = require('qrcode');
require('dotenv').config();

const config = require('./config');
const ui = require('./ui');
const state = require('./state');
const { logEvent } = require('./logger');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  try {
    const guild = config.guildId ? await client.guilds.fetch(config.guildId).catch(() => null) : null;
    if (guild) {
      await ensurePanel(guild);
    }
  } catch (e) {
    console.error('[bot] ensurePanel on ready failed', e);
  }
});

// Helper: check admin
function isAdmin(member) {
  return member.roles.cache.has(config.adminRoleId) || member.permissions.has(PermissionFlagsBits.Administrator);
}

async function ensurePanel(guild) {
  // Create or update a panel message in a system channel named 'escrow-panel'
  let channel = guild.channels.cache.find(c => c.name === 'escrow-panel' && c.type === ChannelType.GuildText);
  if (!channel) {
    channel = await guild.channels.create({ name: 'escrow-panel', type: ChannelType.GuildText, reason: 'Escrow ticket panel' });
  }
  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const existing = messages?.find(m => m.author.id === client.user.id && m.components?.length);
  const panelEmbed = ui.ticketPanelEmbed();
  const panelButtons = ui.ticketPanelButtons();
  if (existing) {
    await existing.edit({ embeds: [panelEmbed], components: [panelButtons] });
  } else {
    await channel.send({ embeds: [panelEmbed], components: [panelButtons] });
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (e) {
    console.error('[interaction] error', e);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

async function handleButton(interaction) {
  const { guild, customId, member } = interaction;
  if (customId === 'open_ticket') {
    return interaction.showModal(ui.dealerModal());
  }

  const ticket = state.getTicket(interaction.channelId);

  switch (customId) {
    case 'assign_seller':
      return interaction.showModal(ui.selectUserModal('seller'));
    case 'assign_buyer':
      return interaction.showModal(ui.selectUserModal('buyer'));
    case 'confirm_parties':
      if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
      if (!(ticket.sellerId && ticket.buyerId)) {
        return interaction.reply({ content: 'Set both seller and buyer first.', ephemeral: true });
      }
      state.updateTicket(interaction.channelId, { status: 'awaiting_amount' });
      await updateTicketHeader(interaction.channel, ticket.channelId);
      await interaction.reply({ content: 'Parties confirmed. Set amount next.', ephemeral: true });
      await logEvent(client, 'Parties Confirmed', `Ticket <#${interaction.channelId}>`, [
        { name: 'Seller', value: `<@${ticket.sellerId}>`, inline: true },
        { name: 'Buyer', value: `<@${ticket.buyerId}>`, inline: true },
      ]);
      return;
    case 'set_amount':
      return interaction.showModal(ui.amountModal());
    case 'confirm_amount': {
      if (!ticket || ticket.amountLtc == null) return interaction.reply({ content: 'Amount not set.', ephemeral: true });
      // Move to deposit stage, show address and buttons
      const address = config.manualLtcDepositAddress;
      state.updateTicket(interaction.channelId, { status: 'awaiting_deposit', depositAddress: address });
      await showDepositPanel(interaction.channel, address, ticket.amountLtc);
      await interaction.reply({ content: 'Amount confirmed. Proceed to deposit.', ephemeral: true });
      await logEvent(client, 'Amount Confirmed', `Ticket <#${interaction.channelId}>`, [
        { name: 'Amount LTC', value: String(ticket.amountLtc), inline: true }
      ]);
      return;
    }
    case 'copy_address':
      if (!ticket?.depositAddress) return interaction.reply({ content: 'No address yet.', ephemeral: true });
      return interaction.reply({ content: `Deposit address: ${ticket.depositAddress}`, ephemeral: true });
    case 'show_qr': {
      if (!ticket?.depositAddress) return interaction.reply({ content: 'No address yet.', ephemeral: true });
      const png = await QRCode.toBuffer(ticket.depositAddress, { type: 'png', scale: 8 });
      const file = new AttachmentBuilder(png, { name: 'ltc_address_qr.png' });
      return interaction.reply({ files: [file], ephemeral: true });
    }
    case 'set_txid':
      return interaction.showModal(ui.txidModal());
    case 'set_payout_address': {
      if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
      return interaction.showModal(ui.payoutModal());
    }
    case 'admin_confirm_deposit': {
      if (!isAdmin(member)) return interaction.reply({ content: 'Admins only.', ephemeral: true });
      if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
      state.updateTicket(interaction.channelId, { status: 'deposited' });
      await interaction.reply({ content: 'Deposit confirmed by admin.', ephemeral: true });
      await logEvent(client, 'Deposit Confirmed', `Ticket <#${interaction.channelId}>`);
      return;
    }
    case 'admin_release': {
      if (!isAdmin(member)) return interaction.reply({ content: 'Admins only.', ephemeral: true });
      if (!ticket || ticket.status !== 'deposited') return interaction.reply({ content: 'Escrow not ready to release.', ephemeral: true });
      if (!ticket.payoutAddress) return interaction.reply({ content: 'Set a payout address first.', ephemeral: true });
      const toUser = ticket.sellerId; // As per flow: release to seller
      state.updateTicket(interaction.channelId, { status: 'released' });
      await interaction.channel.send({ embeds: [ui.releasedEmbed(toUser, ticket.txid)] });
      await interaction.channel.send({ content: `Payout address: 
\n
\n
${'```'}
${ticket.payoutAddress}
${'```'}` });
      await lockTicket(interaction.channel);
      await interaction.reply({ content: 'Released and ticket locked.', ephemeral: true });
      await logEvent(client, 'Escrow Released', `Ticket <#${interaction.channelId}>`, [
        { name: 'Released To', value: `<@${toUser}>`, inline: true },
        { name: 'TXID', value: ticket.txid || 'manual', inline: true },
        { name: 'Payout Address', value: ticket.payoutAddress, inline: false },
      ]);
      return;
    }
    case 'admin_cancel': {
      if (!isAdmin(member)) return interaction.reply({ content: 'Admins only.', ephemeral: true });
      if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
      state.updateTicket(interaction.channelId, { status: 'cancelled' });
      await interaction.channel.send({ embeds: [ui.cancelledEmbed('Cancelled by admin.')] });
      await lockTicket(interaction.channel);
      await interaction.reply({ content: 'Cancelled and ticket locked.', ephemeral: true });
      await logEvent(client, 'Escrow Cancelled', `Ticket <#${interaction.channelId}>`);
      return;
    }
    case 'contact_support': {
      const role = `<@&${config.adminRoleId}>`;
      await interaction.channel.send({ content: `Support requested by <@${interaction.user.id}>. ${role}` });
      return interaction.reply({ content: 'Support pinged.', ephemeral: true });
    }
  }
}

async function handleModal(interaction) {
  const { customId } = interaction;
  if (customId === 'dealer_modal') {
    const dealerId = interaction.fields.getTextInputValue('dealer_id').trim();
    // Create a private channel under category
    const channel = await interaction.guild.channels.create({
      name: `escrow-${interaction.user.username}`.toLowerCase().slice(0, 90),
      type: ChannelType.GuildText,
      parent: config.escrowCategoryId || undefined,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
      reason: 'Escrow ticket',
    });

    const ticket = state.createTicket(channel.id);
    state.updateTicket(channel.id, { sellerId: dealerId });

    const header = ui.baseTicketEmbed(channel.id, dealerId);
    await channel.send({ embeds: [header], components: [ui.partyAssignButtons()] });
    await channel.send({ components: [ui.amountButtons()] });
    await channel.send({ components: [ui.payoutButtons()] });
    await channel.send({ components: [ui.supportButtons(config.adminRoleId), ui.adminButtons()] });

    await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });

    await logEvent(client, 'Ticket Opened', `By <@${interaction.user.id}> in <#${channel.id}>`, [
      { name: 'Seller', value: `<@${dealerId}>`, inline: true },
    ]);
    return;
  }
  if (customId === 'select_seller_modal' || customId === 'select_buyer_modal') {
    const ticket = state.getTicket(interaction.channelId);
    if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    if (customId === 'select_seller_modal') state.updateTicket(interaction.channelId, { sellerId: userId });
    if (customId === 'select_buyer_modal') state.updateTicket(interaction.channelId, { buyerId: userId });
    await updateTicketHeader(interaction.channel, interaction.channelId);
    await interaction.reply({ content: 'Updated.', ephemeral: true });
    await logEvent(client, 'Party Assigned', `Ticket <#${interaction.channelId}>`, [
      { name: 'Seller', value: ticket.sellerId ? `<@${ticket.sellerId}>` : 'Not set', inline: true },
      { name: 'Buyer', value: ticket.buyerId ? `<@${ticket.buyerId}>` : 'Not set', inline: true },
    ]);
    return;
  }
  if (customId === 'amount_modal') {
    const ticket = state.getTicket(interaction.channelId);
    if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
    const amountStr = interaction.fields.getTextInputValue('amount_ltc').trim();
    const amount = Number(amountStr);
    if (!isFinite(amount) || amount <= 0) {
      return interaction.reply({ content: 'Invalid amount.', ephemeral: true });
    }
    state.updateTicket(interaction.channelId, { amountLtc: amount });
    await updateTicketHeader(interaction.channel, interaction.channelId);
    await interaction.reply({ content: `Amount set to ${amount} LTC.`, ephemeral: true });
    await logEvent(client, 'Amount Set', `Ticket <#${interaction.channelId}>`, [
      { name: 'Amount LTC', value: String(amount), inline: true },
    ]);
    return;
  }
  if (customId === 'txid_modal') {
    const ticket = state.getTicket(interaction.channelId);
    if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
    const txid = interaction.fields.getTextInputValue('txid').trim();
    state.updateTicket(interaction.channelId, { txid });
    await interaction.reply({ content: 'TXID saved. Admins will review and confirm.', ephemeral: true });
    await logEvent(client, 'TXID Provided', `Ticket <#${interaction.channelId}>`, [
      { name: 'TXID', value: txid, inline: false },
    ]);
    return;
  }
  if (customId === 'payout_modal') {
    const ticket = state.getTicket(interaction.channelId);
    if (!ticket) return interaction.reply({ content: 'No ticket context.', ephemeral: true });
    const payout = interaction.fields.getTextInputValue('payout_address').trim();
    state.updateTicket(interaction.channelId, { payoutAddress: payout });
    await updateTicketHeader(interaction.channel, interaction.channelId);
    await interaction.reply({ content: 'Payout address saved.', ephemeral: true });
    await logEvent(client, 'Payout Address Set', `Ticket <#${interaction.channelId}>`, [
      { name: 'Payout Address', value: payout },
    ]);
    return;
  }
}

async function updateTicketHeader(channel, channelId) {
  const ticket = state.getTicket(channelId);
  if (!ticket) return;
  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  const headerMsg = messages?.find(m => m.author.id === client.user.id && m.embeds?.length && m.components?.length && m.components[0]?.components?.some(c => c.data?.custom_id === 'assign_seller'));
  const header = new EmbedBuilder()
    .setColor(ui.THEME_COLOR)
    .setTitle('Escrow Ticket')
    .setDescription('Assign participants, set the LTC amount, then proceed to deposit. All events are logged.')
    .addFields(
      { name: 'Ticket Channel', value: `<#${channelId}>`, inline: true },
      { name: 'Seller (Dealer)', value: ticket.sellerId ? `<@${ticket.sellerId}>` : 'Not set', inline: true },
      { name: 'Buyer', value: ticket.buyerId ? `<@${ticket.buyerId}>` : 'Not set', inline: true },
      { name: 'Amount (LTC)', value: ticket.amountLtc != null ? String(ticket.amountLtc) : 'Not set', inline: true },
      { name: 'Status', value: ticket.status, inline: true },
      { name: 'Payout Address', value: ticket.payoutAddress ? ticket.payoutAddress : 'Not set', inline: false },
    )
    .setImage(config.middlemanBannerUrl || null);
  if (headerMsg) {
    await headerMsg.edit({ embeds: [header], components: [ui.partyAssignButtons()] });
  } else {
    await channel.send({ embeds: [header], components: [ui.partyAssignButtons()] });
  }
}

async function showDepositPanel(channel, address, amountLtc) {
  const embed = ui.depositEmbed({ address, amountLtc });
  await channel.send({ embeds: [embed], components: [ui.depositButtons()] });
}

async function lockTicket(channel) {
  const overwrites = channel.permissionOverwrites.cache.map(po => ({ id: po.id, allow: po.allow, deny: po.deny }));
  await channel.permissionOverwrites.set(overwrites.map(ow => {
    if (ow.id === channel.guild.roles.everyone.id) {
      return { id: ow.id, deny: [PermissionFlagsBits.ViewChannel] };
    }
    return { id: ow.id, deny: [PermissionFlagsBits.SendMessages] };
  }));
}

client.on('guildCreate', async (guild) => {
  await ensurePanel(guild);
});

client.login(config.token);
