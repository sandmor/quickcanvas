import Canvas from "@/components/canvas";
import Toolbar from "@/components/toolbar";

export default function Home() {
  return (
    <main className="w-screen h-screen overflow-hidden relative">
      <Toolbar />
      <Canvas />
    </main>
  );
}