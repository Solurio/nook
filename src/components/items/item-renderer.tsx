"use client";

import dynamic from "next/dynamic";
import type { AnyItem, Item } from "@/lib/types";
import ImageItem from "./image-item";
import NoteItem from "./note-item";
import TextItem from "./text-item";
import TokenItem from "./token-item";

/** A frame's worth of nothing while the item's code arrives: the common, small items come with the room. */
function Loading() {
  return <div className="size-full rounded-2xl bg-white/4" />;
}

// Players, documents, shared browsers and the games are fetched when a room has one.
const MediaItem = dynamic(() => import("./media-item"), { loading: Loading });
const EmbedItem = dynamic(() => import("./embed-item"), { loading: Loading });
const GameItem = dynamic(() => import("./game-item"), { loading: Loading });
const CobrowseItem = dynamic(() => import("./cobrowse-item"), { loading: Loading });
const ScreencastItem = dynamic(() => import("./screencast-item"), { loading: Loading });
const PdfItem = dynamic(() => import("./pdf-item"), { loading: Loading });
const GridItem = dynamic(() => import("./grid-item"), { loading: Loading });

export default function ItemRenderer({
  item,
  editing,
  selected,
}: {
  item: AnyItem;
  editing: boolean;
  selected: boolean;
}) {
  switch (item.kind) {
    case "image":
      return <ImageItem item={item as Item<"image">} selected={selected} />;
    case "note":
      return <NoteItem item={item as Item<"note">} editing={editing} />;
    case "text":
      return <TextItem item={item as Item<"text">} editing={editing} />;
    case "media":
      return <MediaItem item={item as Item<"media">} selected={selected} />;
    case "embed":
      return <EmbedItem item={item as Item<"embed">} selected={selected} />;
    case "game":
      return <GameItem item={item as Item<"game">} />;
    case "cobrowse":
      return <CobrowseItem item={item as Item<"cobrowse">} selected={selected} />;
    case "screencast":
      return <ScreencastItem item={item as Item<"screencast">} />;
    case "pdf":
      return <PdfItem item={item as Item<"pdf">} />;
    case "token":
      return <TokenItem item={item as Item<"token">} />;
    case "grid":
      return <GridItem item={item as Item<"grid">} />;
    default:
      return null;
  }
}
