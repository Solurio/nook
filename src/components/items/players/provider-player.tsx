"use client";

import { forwardRef } from "react";
import ElementPlayer from "./element-player";
import SoundCloudPlayer from "./soundcloud-player";
import YouTubePlayer from "./youtube-player";
import type { PlayerControl, ProviderPlayerProps } from "./types";

/** Renders the right player for the current track's provider. */
const ProviderPlayer = forwardRef<PlayerControl, ProviderPlayerProps>(function ProviderPlayer(
  props,
  ref,
) {
  switch (props.provider) {
    case "audio":
    case "video":
      return <ElementPlayer ref={ref} {...props} />;
    case "soundcloud":
      return <SoundCloudPlayer ref={ref} {...props} />;
    default:
      return <YouTubePlayer ref={ref} {...props} />;
  }
});

export default ProviderPlayer;
