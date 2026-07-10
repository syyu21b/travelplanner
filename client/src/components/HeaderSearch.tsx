import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, MapPin } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";

interface DiaryPhoto {
  id: string;
  url: string;
}

interface SearchableDiary {
  id: string;
  title: string;
  location: string;
  content: string;
  tags: string[];
  isPublic: boolean;
  mainPhoto?: DiaryPhoto;
  photos: DiaryPhoto[];
}

function loadPublicDiaries(): SearchableDiary[] {
  try {
    return (JSON.parse(localStorage.getItem("travelDiaries") || "[]") as SearchableDiary[]).filter(d => d.isPublic);
  } catch {
    return [];
  }
}

const MAX_RESULTS = 6;

export default function HeaderSearch() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return loadPublicDiaries().filter(d =>
      d.location.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.tags.some(tag => tag.toLowerCase().includes(q)) ||
      d.content.toLowerCase().includes(q)
    );
  }, [query]);

  const results = allResults.slice(0, MAX_RESULTS);

  const goToCommunity = (diaryId?: string) => {
    try {
      if (diaryId) {
        sessionStorage.setItem("trendingOpenDiaryId", diaryId);
      } else if (query.trim()) {
        sessionStorage.setItem("communitySearchQuery", query.trim());
      }
    } catch {}
    setOpen(false);
    setQuery("");
    setLocation("/community");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-muted-foreground hover:bg-secondary transition-all border border-border"
          aria-label={t("home.header.searchLabel")}
        >
          <Search className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <Input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") goToCommunity();
            }}
            placeholder={t("home.header.searchPlaceholder")}
            className="h-10"
          />
        </div>

        {!query.trim() ? (
          <div className="py-8 px-4 text-center text-sm text-muted-foreground">
            {t("home.header.searchEmpty")}
          </div>
        ) : results.length === 0 ? (
          <div className="py-8 px-4 text-center text-sm text-muted-foreground">
            {t("home.header.searchNoResults")}
          </div>
        ) : (
          <div className="py-1 max-h-80 overflow-y-auto">
            {results.map(d => (
              <button
                key={d.id}
                onClick={() => goToCommunity(d.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary transition-colors"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                  {d.mainPhoto?.url || d.photos?.[0]?.url ? (
                    <img src={d.mainPhoto?.url || d.photos[0].url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" /> {d.location}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {query.trim() && allResults.length > 0 && (
          <button
            onClick={() => goToCommunity()}
            className="w-full px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-secondary transition-colors border-t border-border"
          >
            {t("home.header.searchViewAll", { query: query.trim(), n: allResults.length })}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
