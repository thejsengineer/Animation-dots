import React, { useCallback, useEffect, useRef, useState } from "react";

const MAX_IMAGES = 4;
const SAMPLE_SIZE = 190;
const POINT_STEP = 2;

function imageToParticles(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = width;
      sampleCanvas.height = height;
      const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("Your browser could not read this image."));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const points = [];

      for (let y = 0; y < height; y += POINT_STEP) {
        for (let x = 0; x < width; x += POINT_STEP) {
          const index = (y * width + x) * 4;
          const alpha = pixels[index + 3] / 255;
          if (alpha < 0.12) continue;

          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const brightness = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
          points.push({
            x: (x / width - 0.5) * 2,
            y: (y / height - 0.5) * 2,
            z: (brightness - 0.5) * 0.12 + (Math.random() - 0.5) * 0.035,
            r: red,
            g: green,
            b: blue,
            alpha,
            size: 0.55 + Math.random() * 0.85,
          });
        }
      }

      resolve({ points, aspect: width / height });
    };
    image.onerror = () => reject(new Error("This image could not be opened."));
    image.src = url;
  });
}

function App() {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const rotationRef = useRef({ x: -0.08, y: 0.12 });
  const dragRef = useRef(null);
  const zoomRef = useRef(1);
  const currentPointsRef = useRef([]);
  const slidesRef = useRef([]);
  const [slides, setSlides] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLight, setIsLight] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  slidesRef.current = slides;

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      setError("Choose an image file to create a particle cloud.");
      return;
    }

    const availableSlots = MAX_IMAGES - slidesRef.current.length;
    if (availableSlots <= 0) {
      setError("You can add up to four pictures. Remove one to add another.");
      return;
    }

    setError("");
    const additions = [];
    for (const file of files.slice(0, availableSlots)) {
      const url = URL.createObjectURL(file);
      try {
        const cloud = await imageToParticles(url);
        additions.push({ id: crypto.randomUUID(), name: file.name, url, ...cloud });
      } catch (loadError) {
        URL.revokeObjectURL(url);
        setError(loadError.message);
      }
    }

    if (files.length > availableSlots) {
      setError(`Only ${availableSlots} more picture${availableSlots === 1 ? "" : "s"} can be added.`);
    }
    if (additions.length) {
      setActiveIndex(slidesRef.current.length);
      setSlides((previous) => [...previous, ...additions]);
    }
  }, []);

  const handleFileInput = (event) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    let frameId;
    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(bounds.width * pixelRatio);
      canvas.height = Math.round(bounds.height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);

    const render = (time) => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const points = currentPointsRef.current;
      context.clearRect(0, 0, width, height);

      const rotation = rotationRef.current;
      const scale = Math.min(width * 0.38, height * 0.37) * zoomRef.current;
      const cosY = Math.cos(rotation.y);
      const sinY = Math.sin(rotation.y);
      const cosX = Math.cos(rotation.x);
      const sinX = Math.sin(rotation.x);
      const centerX = width / 2;
      const centerY = height / 2;

      for (const point of points) {
        const drift = Math.sin(time * 0.0007 + point.x * 8 + point.y * 11) * 0.006;
        const x = point.x;
        const y = point.y;
        const z = point.z + drift;
        const rotatedX = x * cosY - z * sinY;
        const rotatedZ = x * sinY + z * cosY;
        const rotatedY = y * cosX - rotatedZ * sinX;
        const depth = y * sinX + rotatedZ * cosX;
        const perspective = 1 / (1 + depth * 0.28);
        const screenX = centerX + rotatedX * scale * perspective;
        const screenY = centerY + rotatedY * scale * perspective;
        const depthGlow = Math.max(0.35, 1 - depth * 0.35);
        const alpha = Math.min(1, point.alpha * (isLight ? 0.78 : 0.95) * depthGlow);
        const color = isLight
          ? `rgba(${Math.round(point.r * 0.52)},${Math.round(point.g * 0.52)},${Math.round(point.b * 0.52)},${alpha})`
          : `rgba(${point.r},${point.g},${point.b},${alpha})`;
        const radius = Math.max(0.35, point.size * perspective * (isLight ? 0.88 : 1));

        context.beginPath();
        context.fillStyle = color;
        context.shadowBlur = isLight ? 0 : 7;
        context.shadowColor = color;
        context.arc(screenX, screenY, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [isLight]);

  useEffect(() => {
    const slide = slides[activeIndex];
    if (!slide) {
      currentPointsRef.current = [];
      return;
    }
    currentPointsRef.current = slide.points;
    rotationRef.current = { x: -0.08, y: 0.12 };
  }, [slides, activeIndex]);

  useEffect(() => () => {
    slidesRef.current.forEach((slide) => URL.revokeObjectURL(slide.url));
  }, []);

  const removeSlide = (index) => {
    const removed = slides[index];
    if (removed) URL.revokeObjectURL(removed.url);
    const next = slides.filter((_, itemIndex) => itemIndex !== index);
    setActiveIndex((current) => {
      if (!next.length) return 0;
      if (index < current) return current - 1;
      return Math.min(current, next.length - 1);
    });
    setSlides(next);
  };

  const handlePointerDown = (event) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    rotationRef.current.y += deltaX * 0.008;
    rotationRef.current.x += deltaY * 0.008;
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    zoomRef.current = Math.min(2.2, Math.max(0.55, zoomRef.current - event.deltaY * 0.001));
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await stageRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const cycleImage = () => {
    if (slides.length > 1) setActiveIndex((current) => (current + 1) % slides.length);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };

  return (
    <main className={isLight ? "app light" : "app"}>
      <header className="topbar">
        <a className="wordmark" href="#" aria-label="Gather home">G A T H E R</a>
        <div className="top-actions">
          <span className="edition">PHOTO STUDY&nbsp; / &nbsp;01</span>
          <button className="icon-button" onClick={() => setIsLight((value) => !value)} aria-label="Toggle light and dark paper">
            ◐
          </button>
          <button className="icon-button fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Full screen"}>
            {isFullscreen ? "⛶" : "□"}
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className={`stage ${isDragging ? "is-dragging" : ""} ${slides.length ? "has-image" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} aria-label="Interactive particle rendering of your image" />
        {slides.length === 0 && (
          <div className="empty-state">
            <div className="orbit-mark" aria-hidden="true"><i /><i /><i /></div>
            <p className="eyebrow">A PICTURE, IN MOTION</p>
            <h1>Give your image<br />a little dimension.</h1>
            <p className="empty-copy">Drop in a photo and watch it become a field of light.</p>
            <label className="upload-button">
              CHOOSE A PICTURE <span aria-hidden="true">↗</span>
              <input type="file" accept="image/*" onChange={handleFileInput} />
            </label>
          </div>
        )}
        {slides.length > 0 && (
          <div className="stage-hint">
            DRAG TO TURN <span>·</span> SCROLL TO ZOOM
          </div>
        )}
        {isDragging && (
          <div className="drop-overlay">
            <span>RELEASE TO GATHER</span>
          </div>
        )}
      </section>

      <footer className="control-panel">
        <div className="gallery-row">
          <div className="gallery">
            {slides.map((slide, index) => (
              <div className={`thumb-wrap ${index === activeIndex ? "selected" : ""}`} key={slide.id}>
                <button className="thumbnail" onClick={() => setActiveIndex(index)} aria-label={`Show picture ${index + 1}: ${slide.name}`} aria-pressed={index === activeIndex}>
                  <img src={slide.url} alt="" />
                </button>
                <button className="remove-thumb" onClick={() => removeSlide(index)} aria-label={`Remove ${slide.name}`}>×</button>
                <span className="thumb-number">0{index + 1}</span>
              </div>
            ))}
            {slides.length < MAX_IMAGES && (
              <label className="add-tile" title="Add picture">
                +
                <input type="file" accept="image/*" multiple onChange={handleFileInput} />
              </label>
            )}
          </div>
          <div className="image-count">{slides.length}/{MAX_IMAGES}<span> PICTURES</span></div>
        </div>

        <div className="action-row">
          <button className="action-button" onClick={cycleImage} disabled={slides.length < 2}>
            <span className="play-symbol">▶</span> NEXT PICTURE
          </button>
          <button className="action-button" onClick={() => setIsLight((value) => !value)}>
            <span className="light-symbol">●</span> {isLight ? "DARK PAPER" : "LIGHT PAPER"}
          </button>
        </div>
        <div className="bottomline">
          <span>{slides[activeIndex]?.name || "YOUR PHOTOS, REIMAGINED AS PARTICLES"}</span>
          {slides.length < MAX_IMAGES && <label className="add-link">ADD PICTURES<input type="file" accept="image/*" multiple onChange={handleFileInput} /></label>}
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </footer>
    </main>
  );
}

export default App;
