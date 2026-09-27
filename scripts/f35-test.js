import { createF35Scene } from "./f35-scene.js";
import { setupF35Controls } from "./f35-controls.js";

createF35Scene(document.querySelector("#f35")).then(scene => {
  setupF35Controls(scene);
  scene.setVisible(true);
}).catch(error => console.error("Could not create F-35 point cloud:", error));
