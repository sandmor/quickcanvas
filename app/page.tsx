import Canvas from "@/components/canvas";
import Toolbar from "@/components/toolbar";
import DownloadButton from "@/components/download-button";
import ActionsPanel from "@/components/actions-panel";
import DocumentMenu from "@/components/document-menu";

export default function Home() {
  return (
    <main className="w-screen h-screen overflow-hidden relative">
      <Toolbar />
      <DocumentMenu />
      <DownloadButton />
      <ActionsPanel />
      <Canvas />
    </main>
  );
}