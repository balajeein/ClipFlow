# ClipFlow

ClipFlow is a Telegram-to-YouTube URL queue. This repository currently contains
the first milestone only: the Telegram bot accepts configured Instagram Reel and
YouTube Shorts URLs and saves them to the existing Supabase `public.submissions`
table.

## Milestone 1 setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the existing credentials. The bot
   requires `TELEGRAM_GROUP_ID`; any non-bot member of that group may submit URLs.
   `ADMIN_IDS` remains reserved for administrative commands.

3. Start the bot:

   ```sh
   npm run bot
   ```

The process performs a read-only startup check against the existing
`public.submissions` columns before it begins polling. It does not create,
drop, or alter any database objects.

The Supabase secret key is server-side only. Never commit `.env` or share its
contents.

## Current behavior

- Accepts supported URLs from senders in the configured Telegram group,
  including messages sent by other bots.
- Extracts Instagram `/reel/...` and YouTube `/shorts/...` URLs from message text
  or captions.
- Checks for an existing `source_url` before inserting a row.
- Saves the Telegram user ID, display username, URL, and source type.
- Replies with the generated database queue ID.

Commands, uploader processing, source-file authorization, YouTube OAuth, and
admin controls are intentionally deferred until this ingestion milestone is
approved.

## Milestone 3 stage 1

The queue claim function and media-provider interface are now present, but the
manual uploader remains intentionally non-mutating. `npm run uploader` verifies
the existing schema and previews the oldest pending item without claiming,
downloading, or uploading it. Actual media retrieval and YouTube upload will be
implemented only after the provider design is approved.

Telegram MP4 uploads are handled separately from URL submissions: a video or
MP4 document sent by a non-bot member in the configured group is streamed to a
temporary directory, uploaded publicly to the verified YouTube channel one at a
time, acknowledged in Telegram, and then deleted locally. URL submissions
continue using the Supabase queue.
