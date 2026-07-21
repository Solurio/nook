"use client";

import type { AnyItem, Item } from "@/lib/types";
import ImageItem from "./image-item";
import NoteItem from "./note-item";
import TextItem from "./text-item";
import MediaItem from "./media-item";
import EmbedItem from "./embed-item";
import GameItem from "./game-item";
import CobrowseItem from "./cobrowse-item";
import ScreencastItem from "./screencast-item";

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
    default:
      return null;
  }
}
