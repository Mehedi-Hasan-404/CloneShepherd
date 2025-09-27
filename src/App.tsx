import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { RecentsProvider } from "@/contexts/RecentsContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Favorites from "@/pages/Favorites";
import CategoryChannels from "@/pages/CategoryChannels";
import ChannelPlayer from "@/pages/ChannelPlayer";
import Admin from "@/pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider defaultTheme="dark" storageKey="iptv-ui-theme">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <FavoritesProvider>
            <RecentsProvider>
              <Routes>
                <Route path="/" element={<Layout><Home /></Layout>} />
                <Route path="/favorites" element={<Layout><Favorites /></Layout>} />
                <Route path="/category/:slug" element={<Layout><CategoryChannels /></Layout>} />
                <Route path="/channel/:channelId" element={<Layout><ChannelPlayer /></Layout>} />
                <Route path="/admin/*" element={<Admin />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </RecentsProvider>
          </FavoritesProvider>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
