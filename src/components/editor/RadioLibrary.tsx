import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, GripVertical, Heart, ListPlus, Play, Plus, Shuffle, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SHOWCASE_TRACKS, type ShowcaseTrack } from "@/engine/trackPlayer";
import { useStore } from "@/store/useStore";
import type { RadioBroadcast } from "@/hooks/useRadioBroadcast";
import { useRadioLibrary, type RadioPlaylist } from "@/hooks/useRadioLibrary";
import { knownRadioTracks, radioLink } from "@/lib/radioLinks";
import { RadioShareTag } from "./RadioShareToast";

export type LibraryState = ReturnType<typeof useRadioLibrary>;
const iconButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 disabled:opacity-30";
export function FavoriteSong({ track, library }: { track: ShowcaseTrack; library: LibraryState }) {
  const favorite = library.favorites.includes(track.id);
  if (!library.user) return <Link to={`/auth?next=${encodeURIComponent(`/radio?track=${track.id}`)}`} aria-label={`Sign in to favorite ${track.title}`} title="Sign in to save favorites" className={iconButton}><Heart size={18}/></Link>;
  return <button type="button" className={iconButton} aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${track.title}`} aria-pressed={favorite} disabled={library.busy || library.loading || !!library.error} onClick={() => void library.toggleFavorite(track.id)}><Heart size={18} className={favorite ? "fill-pink-400 text-pink-400" : ""}/></button>;
}
function AddToPlaylist({ track, library }: { track: ShowcaseTrack; library: LibraryState }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" aria-label={`Add ${track.title} to playlist`} title="Add to playlist" className={iconButton}><ListPlus size={18}/></button></PopoverTrigger>
    <PopoverContent side="top" className="z-[10060] border-white/20 bg-[#100b1a] text-sm text-white" onKeyDown={e => e.stopPropagation()}>
      {!library.user ? <Link to={`/auth?next=${encodeURIComponent(`/radio?track=${track.id}`)}`} className="text-cyan-200">Sign in to make playlists</Link> : <>
        <p className="mb-2 font-semibold">Add to playlist</p>
        <div className="max-h-48 overflow-y-auto">{library.playlists.map(p => <button type="button" key={p.id} disabled={library.busy || library.loading} className="block w-full rounded p-2 text-left hover:bg-white/10 disabled:opacity-40" onClick={async () => {
          if (await library.savePlaylist(p.name, [...p.track_ids, track.id], p.id)) setOpen(false);
        }}>{p.name}{p.track_ids.includes(track.id) ? " · added" : ""}</button>)}</div>
        <form onSubmit={async e => { e.preventDefault(); if (await library.savePlaylist(name, [track.id])) { setOpen(false); setName(""); } }} className="mt-2 flex gap-2">
          <input aria-label="New playlist name" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="New playlist" className="min-w-0 flex-1 rounded border border-white/20 bg-black/30 p-2"/>
          <button type="submit" disabled={!name.trim() || library.busy || library.loading} className="rounded border border-cyan-300/40 px-2 text-cyan-200 disabled:opacity-40">Create</button>
        </form>
      </>}
    </PopoverContent>
  </Popover>;
}
function TrackRow({ track, radio, library, index, total, onMove, onRemove, drag }: {
  track: ShowcaseTrack; radio: RadioBroadcast; library: LibraryState; index?: number; total?: number;
  onMove?: (from: number, to: number) => void; onRemove?: (index: number) => void;
  /** Supplied by QueueList for rows that can be dragged into a new position. */
  drag?: DragHandlers;
}) {
  const draggable = drag !== undefined && index !== undefined;
  return <li
    className={`border-b border-white/10 py-2 ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${drag?.overIndex === index && drag?.fromIndex !== index ? "bg-cyan-200/10" : ""}`}
    draggable={draggable || undefined}
    onDragStart={draggable ? e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(index)); drag!.onStart(index!); } : undefined}
    onDragOver={draggable ? e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; drag!.onOver(index!); } : undefined}
    onDrop={draggable ? e => { e.preventDefault(); drag!.onDrop(index!); } : undefined}
    onDragEnd={draggable ? () => drag!.onEnd() : undefined}
  >
    <div className="flex items-center gap-2">
      {draggable && <GripVertical size={16} aria-hidden className="shrink-0 text-white/30" />}
      <button type="button" className={iconButton} aria-label={`Play ${track.title}`} onClick={() => radio.playNow(track)}><Play size={16}/></button>
      <div className="min-w-0 flex-1"><a href={radioLink({ track })} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); radio.playNow(track); } }} className="block break-words text-sm font-medium text-white hover:text-cyan-200">{index !== undefined ? `${index + 1}. ` : ""}{track.title}</a><p className="text-xs text-white/50">{track.artist}</p></div>
      <FavoriteSong track={track} library={library}/>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-1">
      {onMove && index !== undefined ? <>
        <button type="button" className={iconButton} disabled={index === 0} aria-label={`Move ${track.title} up`} onClick={() => onMove(index, index - 1)}><ArrowUp size={16}/></button>
        <button type="button" className={iconButton} disabled={index === (total || 0) - 1} aria-label={`Move ${track.title} down`} onClick={() => onMove(index, index + 1)}><ArrowDown size={16}/></button>
        <button type="button" className={iconButton} aria-label={`Remove ${track.title}`} onClick={() => onRemove?.(index)}><X size={16}/></button>
      </> : <>
        <button type="button" className="min-h-10 rounded-lg px-2 text-xs text-white/80 hover:bg-white/10" onClick={() => { radio.enqueue(track, true); toast.success(`${track.title} plays next`); }}>Play next</button>
        <button type="button" className={iconButton} title="Add to queue" aria-label={`Queue ${track.title}`} onClick={() => { radio.enqueue(track); toast.success("Added to queue"); }}><Plus size={18}/></button>
      </>}
      <AddToPlaylist track={track} library={library}/>
      <RadioShareTag url={radioLink({ track })} title={track.title}/>
    </div>
  </li>;
}
type DragHandlers = {
  fromIndex: number | null;
  overIndex: number | null;
  onStart: (index: number) => void;
  onOver: (index: number) => void;
  onDrop: (index: number) => void;
  onEnd: () => void;
};

/**
 * The queue, reorderable by dragging.
 *
 * The arrows stay. They are not a lesser fallback: drag-and-drop is a
 * mouse gesture — HTML5 DnD does not fire for touch at all — and moving a song
 * from tenth to second by dragging inside a scrolling panel on a phone is worse
 * than pressing a button eight times. They are also the only way to do this
 * from a keyboard. So the drag is the addition, not the replacement.
 */
function QueueList({ radio, library }: { radio: RadioBroadcast; library: LibraryState }) {
  const [fromIndex, setFrom] = useState<number | null>(null);
  const [overIndex, setOver] = useState<number | null>(null);
  const drag: DragHandlers = {
    fromIndex, overIndex,
    onStart: setFrom,
    onOver: index => setOver(prev => (prev === index ? prev : index)),
    onDrop: index => {
      // `fromIndex` rather than the dataTransfer payload: the same state drives
      // the drop highlight, so reading it here means the row that lit up is
      // exactly the row that moves.
      if (fromIndex !== null && fromIndex !== index) radio.move(fromIndex, index);
      setFrom(null);
      setOver(null);
    },
    onEnd: () => { setFrom(null); setOver(null); },
  };
  return <ul>{radio.queue.map((track, i) => (
    <TrackRow
      key={`${track.id}-${i}`} track={track} radio={radio} library={library}
      index={i} total={radio.queue.length} onMove={radio.move} onRemove={radio.remove} drag={drag}
    />
  ))}</ul>;
}

/**
 * Put your own song on the air.
 *
 * Object URLs, so the file never leaves the machine and nothing is uploaded
 * anywhere — `assertSafeTrackUrl` admits `blob:` for exactly this. They last as
 * long as the tab does; keeping them across sessions means somewhere to put the
 * bytes, which is a different piece of work.
 */
function AddYourOwn({ radio }: { radio: RadioBroadcast }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addUploadedTrack = useStore(s => s.addUploadedTrack);

  const take = (files: FileList | null) => {
    const chosen = [...(files ?? [])].filter(f => f.type.startsWith("audio/"));
    if (!chosen.length) { toast.error("Choose an audio file"); return; }
    const added = chosen.map((file, i) => {
      const title = file.name.replace(/\.[^.]+$/, "");
      const track: ShowcaseTrack = {
        id: `upload-${Date.now()}-${i}`,
        url: URL.createObjectURL(file),
        title,
        artist: "Your upload",
      };
      addUploadedTrack({ id: track.id, url: track.url, title });
      radio.enqueue(track);
      return track;
    });
    toast.success(added.length === 1 ? `${added[0].title} added to the queue` : `${added.length} songs added to the queue`);
  };

  return <>
    <input
      ref={fileRef} type="file" accept="audio/*" multiple className="hidden"
      aria-label="Add your own songs to the queue"
      onChange={e => { take(e.target.files); e.target.value = ""; }}
    />
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      className="flex min-h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white/80 hover:bg-white/10"
    >
      <Upload size={15}/> Add your own
    </button>
  </>;
}

function PlaylistEditor({ playlist, radio, library }: { playlist: RadioPlaylist; radio: RadioBroadcast; library: LibraryState }) {
  const [name, setName] = useState(playlist.name);
  const [tracks, setTracks] = useState(() => knownRadioTracks(playlist.track_ids));
  const [deleting, setDeleting] = useState(false);
  return <details className="rounded-xl border border-white/15 p-3">
    <summary className="cursor-pointer break-words text-sm font-medium">{playlist.name} <span className="text-white/50">· {playlist.track_ids.length}</span></summary>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className="min-h-10 rounded-lg bg-cyan-200/10 px-3 text-sm text-cyan-200" disabled={!tracks.length} onClick={() => radio.playQueue(tracks)}>Play playlist</button>
      <button type="button" className="min-h-10 px-2 text-sm" disabled={!tracks.length} onClick={() => { tracks.forEach(t => radio.enqueue(t)); toast.success("Playlist added to queue"); }}>Queue</button>
      <RadioShareTag url={radioLink({ tracks, name })} title={name}/>
    </div>
    <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); void library.savePlaylist(name, tracks.map(t => t.id), playlist.id); }}>
      <input aria-label={`Rename ${playlist.name}`} value={name} maxLength={80} onChange={e => setName(e.target.value)} className="min-w-0 flex-1 rounded border border-white/20 bg-black/30 px-2 py-2 text-sm"/>
      <button type="submit" disabled={library.busy || !name.trim()} className="min-h-10 rounded-lg px-2 text-sm text-cyan-200 disabled:opacity-40">Save edits</button>
    </form>
    <ul>{tracks.map((track, i) => <TrackRow key={track.id} track={track} radio={radio} library={library} index={i} total={tracks.length}
      onMove={(from, to) => setTracks(items => { const next = [...items]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; })}
      onRemove={index => setTracks(items => items.filter((_, j) => index !== j))}/>)}</ul>
    {deleting ? <div className="mt-2 flex items-center gap-2 text-sm"><span>Delete playlist?</span><button type="button" disabled={library.busy} onClick={() => void library.deletePlaylist(playlist.id)} className="min-h-10 px-2 text-pink-300">Delete</button><button type="button" onClick={() => setDeleting(false)} className="min-h-10 px-2">Keep</button></div>
      : <button type="button" onClick={() => setDeleting(true)} className="mt-2 min-h-10 text-sm text-white/50">Delete playlist</button>}
  </details>;
}
export function RadioLibrary({ radio, library }: { radio: RadioBroadcast; library: LibraryState }) {
  const [query, setQuery] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const snapshot = knownRadioTracks([...(radio.nowPlaying ? [radio.nowPlaying.id] : []), ...radio.queue.map(t => t.id)]);
  const matches = (track: ShowcaseTrack) => `${track.title} ${track.artist}`.toLowerCase().includes(query.toLowerCase());
  return <Tabs defaultValue="queue" className="border-t border-white/15 px-3 pb-3 pt-2" onKeyDown={e => e.stopPropagation()}>
    <TabsList className="grid w-full grid-cols-4 bg-white/5"><TabsTrigger value="queue" className="px-1">Queue</TabsTrigger><TabsTrigger value="songs" className="px-1">Songs</TabsTrigger><TabsTrigger value="favorites" className="px-1">Favorites</TabsTrigger><TabsTrigger value="playlists" className="px-1">Playlists</TabsTrigger></TabsList>
    {library.error && <p role="alert" className="mt-2 text-sm text-pink-200">{library.error} <button type="button" className="min-h-10 underline" onClick={() => void library.refresh()}>Retry</button></p>}
    <div className="max-h-[min(48dvh,28rem)] overflow-y-auto overscroll-contain pr-1">
      <TabsContent value="queue">
        <div className="flex flex-wrap items-center justify-between gap-1"><button type="button" className="flex min-h-10 items-center gap-2 text-sm text-cyan-200" onClick={radio.shuffle}><Shuffle size={16}/> Shuffle queue</button><RadioShareTag url={radioLink({ tracks: snapshot, name: "My MOSH queue" })} title="this queue"/></div>
        <div className="my-2"><AddYourOwn radio={radio}/></div>
        <p className="my-1 text-xs text-white/50">Up next · drag to reorder, or use the arrows</p>
        <QueueList radio={radio} library={library}/>
        {radio.history.length > 0 && <details className="mt-3"><summary className="min-h-10 cursor-pointer text-sm text-white/60">Recently played</summary><ul>{[...radio.history].reverse().slice(0, 20).map((track, i) => <TrackRow key={`${track.id}-${i}`} track={track} radio={radio} library={library}/>)}</ul></details>}
      </TabsContent>
      <TabsContent value="songs"><input aria-label="Search radio songs" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a song" className="my-2 w-full rounded-lg border border-white/20 bg-black/30 p-2 text-base"/><ul>{SHOWCASE_TRACKS.filter(matches).map(track => <TrackRow key={track.id} track={track} radio={radio} library={library}/>)}</ul>{!SHOWCASE_TRACKS.some(matches) && <p className="py-4 text-sm text-white/60">No songs match that search.</p>}</TabsContent>
      <TabsContent value="favorites">
        {!library.user ? <SignIn/> : library.loading ? <p className="py-3 text-sm">Loading favorites…</p> : <><ul>{knownRadioTracks(library.favorites).map(track => <TrackRow key={track.id} track={track} radio={radio} library={library}/>)}</ul>{!library.favorites.length && <p className="py-4 text-sm text-white/60">Tap a song’s heart to save it here.</p>}</>}
      </TabsContent>
      <TabsContent value="playlists">
        {!library.user ? <SignIn/> : <>
          <form className="my-3 flex flex-wrap gap-2" onSubmit={async e => { e.preventDefault(); if (await library.savePlaylist(playlistName, snapshot.map(t => t.id))) setPlaylistName(""); }}>
            <input aria-label="Playlist name" value={playlistName} maxLength={80} onChange={e => setPlaylistName(e.target.value)} placeholder="Name this queue" className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 p-2 text-base"/>
            <button type="submit" disabled={!playlistName.trim() || library.busy || library.loading} className="min-h-10 rounded-lg border border-cyan-200/40 px-3 text-sm text-cyan-200 disabled:opacity-40">Save queue</button>
          </form>
          {library.loading && <p className="py-2 text-sm">Loading playlists…</p>}
          <div className="space-y-2">{library.playlists.map(playlist => <PlaylistEditor key={`${playlist.id}-${playlist.updated_at}`} playlist={playlist} radio={radio} library={library}/>)}</div>
          {!library.loading && !library.playlists.length && <p className="py-3 text-sm text-white/60">Save your queue, or add songs with the playlist icon.</p>}
        </>}
      </TabsContent>
    </div>
  </Tabs>;
}
function SignIn() { return <Link to={`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="my-3 block rounded-xl border border-cyan-200/30 p-3 text-sm text-cyan-200">Sign in to save favorites and playlists</Link>; }
