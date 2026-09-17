-- Widen what the decorations bucket will take.
--
-- It was set up for a handful of image types plus three audio ones, which
-- turned out to be too narrow in both directions: a photo straight off a phone
-- is usually HEIC and was refused outright, and the video and .m4a the player
-- learned to handle could never reach storage at all.
--
-- The size limit goes up with it, since ten megabytes is a short clip.

update storage.buckets
set
  file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = array[
    -- Images, including what phones actually produce.
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/tiff',
    -- Audio.
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
    'audio/opus',
    -- Video.
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime'
  ]
where id = 'decorations';
