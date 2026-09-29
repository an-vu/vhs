import { models } from "../model/registry.js";
import { createModelScene } from "../model/scene.js";
import { setupModelControls } from "../model/controls.js";

createModelScene(document.querySelector("#f35"), models.find(model => model.id === "f35-points")).then(scene => {
  setupModelControls(scene);
  scene.setVisible(true);
}).catch(error => console.error("Could not create F-35 point cloud:", error));
