import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// M3U Parser Function
export function parseM3U(text: string) {
    const lines = text.split(/\r?\n/);
    const channels = [];
    let currentChannel: { name?: string; logo?: string; link?: string } = {};

    for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
            const nameMatch = line.match(/,(.*)$/);
            const name = nameMatch ? nameMatch[1].trim() : 'Unnamed Channel';

            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            const logo = logoMatch ? logoMatch[1] : undefined;

            currentChannel = { name, logo };
        } else if (line.trim() && !line.startsWith('#')) {
            if (currentChannel.name) {
                currentChannel.link = line.trim();
                channels.push(currentChannel);
                currentChannel = {};
            }
        }
    }
    return channels;
}
