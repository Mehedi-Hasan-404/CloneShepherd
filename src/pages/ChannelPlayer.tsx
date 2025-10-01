import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import VideoPlayer from "@/components/VideoPlayer";
import { useFavorites } from "@/hooks/useFavorites";
import { useRecents } from "@/hooks/useRecents";
import ErrorBoundary from "@/components/ErrorBoundary";
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";

interface Channel {
  id: string;
  name: string;
  logo: string;
  categoryId: string;
  streamUrl: string;
}

export default function ChannelPlayer() {
  const { channelId } = useParams<{ channelId: string }>();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [relatedChannels, setRelatedChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState("");
  const { addFavorite, removeFavorite, isFavorite } = useFavorites();
  const { addRecent } = useRecents();

  useEffect(() => {
    const fetchChannel = async () => {
      if (!channelId) return;
      const channelDoc = await getDoc(doc(db, "channels", channelId));
      if (channelDoc.exists()) {
        const channelData = { id: channelDoc.id, ...channelDoc.data() } as Channel;
        setChannel(channelData);
        addRecent(channelData);

        // fetch related channels
        const categoryDoc = await getDoc(doc(db, "categories", channelData.categoryId));
        if (categoryDoc.exists()) {
          const categoryData = categoryDoc.data() as { channels: Channel[] };
          setRelatedChannels(categoryData.channels);
        }
      }
    };

    fetchChannel();
  }, [channelId, addRecent]);

  if (!channel) return <div className="p-4">Loading...</div>;

  const filteredRelated = relatedChannels.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <ErrorBoundary>
        <div className="w-full h-full flex flex-col">
          {/* Video Player */}
          <VideoPlayer streamUrl={channel.streamUrl} channelName={channel.name} />

          {/* Channel Info + Favorites */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={channel.logo} alt={channel.name} className="w-10 h-10 rounded" />
              <h1 className="text-xl font-semibold">{channel.name}</h1>
            </div>
            <button
              onClick={() =>
                isFavorite(channel.id) ? removeFavorite(channel.id) : addFavorite(channel)
              }
              className="px-3 py-1 rounded bg-primary text-white"
            >
              {isFavorite(channel.id) ? "Remove Favorite" : "Add Favorite"}
            </button>
          </div>

          {/* Search Related Channels */}
          <div className="p-4">
            <Input
              placeholder="Search related channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Related Channels List */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
            {filteredRelated.map((c) => (
              <a
                key={c.id}
                href={`/channel/${c.id}`}
                className="p-3 rounded bg-secondary hover:bg-accent transition flex flex-col items-center"
              >
                <img src={c.logo} alt={c.name} className="w-14 h-14 rounded mb-2" />
                <span className="text-sm text-center">{c.name}</span>
              </a>
            ))}
          </div>
        </div>
      </ErrorBoundary>
    </Layout>
  );
}
