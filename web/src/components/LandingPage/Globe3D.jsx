import React, { useEffect, useRef } from "react";
import Globe from "globe.gl";
import * as THREE from "three";

export default function Globe3D({ onReady }) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;

    const el = containerRef.current;
    const world = Globe({ animateIn: false, rendererConfig: { antialias: true, alpha: true } })(el)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#6366f1")
      .atmosphereAltitude(0.18)
      .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg")
      .bumpImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png")
      .polygonCapColor(() => "rgba(255, 255, 255, 0)")
      .polygonSideColor(() => "rgba(255, 255, 255, 0)")
      .polygonStrokeColor(() => "rgba(255, 255, 255, 0)")
      .polygonsTransitionDuration(0);

    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.6;
    world.controls().enableZoom = false;
    world.controls().enablePan = false;
    world.controls().enableRotate = false;
    world.pointOfView({ lat: 25, lng: 0, altitude: 2.8 });

    globeRef.current = world;

    let features = [];
    let lastProgress = -1;

    // Countries
    fetch("https://cdn.jsdelivr.net/npm/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson")
      .then((r) => r.json())
      .then((geo) => {
        features = geo.features.filter((d) => d.properties.ISO_A2 !== "AQ");
        world.polygonsData(features);
        world.polygonAltitude(0.006);
      });

    // Clouds
    new THREE.TextureLoader().load(
      "https://cdn.jsdelivr.net/npm/globe.gl/example/clouds/clouds.png",
      (tex) => {
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(world.getGlobeRadius() * 1.004, 75, 75),
          new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0.45 })
        );
        world.scene().add(clouds);
        (function spin() {
          clouds.rotation.y -= 0.006 * Math.PI / 180;
          requestAnimationFrame(spin);
        })();
      }
    );

    // Scroll handler
    const handleScroll = () => {
      const vh = window.innerHeight;
      const y = window.scrollY;

      const progress = Math.min(1, Math.max(0, (y - vh * 0.8) / (vh * 2.4)));

      if (features.length && Math.abs(progress - lastProgress) > 0.004) {
        lastProgress = progress;

        world.polygonAltitude((feat) => {
          const pop = +feat.properties.POP_EST;
          const target = Math.max(0.1, Math.sqrt(pop) * 7e-5);
          return 0.006 + (target - 0.006) * progress;
        });

        const capA = (progress * 0.45).toFixed(3);
        const sideA = (progress * 0.12).toFixed(3);
        const strokeA = (progress * 0.25).toFixed(3);
        world.polygonCapColor(() => `rgba(220, 228, 235, ${capA})`);
        world.polygonSideColor(() => `rgba(200, 212, 225, ${sideA})`);
        world.polygonStrokeColor(() => `rgba(235, 240, 245, ${strokeA})`);
      }

      // Globe zoom
      const zoomProgress = Math.min(1, Math.max(0, (progress - 0.6) / 0.4));
      const eased = zoomProgress * zoomProgress * (3 - 2 * zoomProgress);
      const currentScale = 1 + eased * 0.7;
      const globeWrap = el.parentElement;
      if (globeWrap) {
        globeWrap.style.transform = `scale(${currentScale})`;
      }

      // Fade out globe
      const heroEnd = vh * 3.6;
      const globeFade = Math.max(0, Math.min(1, 1 - (y - heroEnd * 0.88) / (heroEnd * 0.12)));
      if (globeWrap) {
        globeWrap.style.opacity = globeFade;
      }

      world.controls().autoRotateSpeed = 0.6 + progress * 2;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    world.onGlobeReady(() => {
      onReady?.();
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (world.renderer()) {
        world.renderer().dispose();
        world.renderer().forceContextLoss();
      }
      globeRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
