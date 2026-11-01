const MIRRORED_MEDIA={
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/presentation/Video-33455.mp4": "assets/mirrored-media/media-01.mp4",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/7583ab72-75d5-405c-85fc-342cc0260bd6-WXWX.png": "assets/mirrored-media/media-02.png",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/7d56aa52-2db1-4e2e-8c4e-1bcbe79eceeb-WhatsApp-Image-2026-10-18-at-00.14.48.jpeg": "assets/mirrored-media/media-03.jpg",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/46869dd3-54f5-4105-bec4-b2f4987dba21-WhatsApp-Image-2026-10-18-at-00.14.48--2-.jpeg": "assets/mirrored-media/media-04.jpg",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/f91601fb-b359-421d-880a-63e779bf62cb-WhatsApp-Image-2026-10-18-at-00.14.48--1-.jpeg": "assets/mirrored-media/media-05.jpg",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/2b33057d-43b3-4f06-8639-0c6d8b90edb3-qsdqsdq.png": "assets/mirrored-media/media-06.png",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/94d38f7c-8dab-4d0f-9b3d-fdba4c70c8b1-sX.png": "assets/mirrored-media/media-07.png",
  "https://yegtfnpdewcldnqtyyte.supabase.co/storage/v1/object/public/website-media/e69d45f7-b569-444e-9213-e72f551d005b/0c3b6ec1-f9dd-4398-bdb8-6b191eece780-cwx.png": "assets/mirrored-media/media-08.png"
};
export function mirrorMediaUrl(url){return MIRRORED_MEDIA[url]||url||'';}
