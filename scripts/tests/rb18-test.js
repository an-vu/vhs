import rb18 from "../model/settings/rb18.js";
import { createModelScene } from "../model/scene.js";
import { setupModelControls } from "../model/controls.js";

createModelScene(document.querySelector("#rb18"), rb18).then(scene => {
  setupModelControls(scene);
  scene.setVisible(true);
}).catch(error => {
  console.error("Could not create RB18 point cloud:", error);
  document.querySelector("#rb18").textContent = "Could not load RB18. Check the browser console for details.";
});
