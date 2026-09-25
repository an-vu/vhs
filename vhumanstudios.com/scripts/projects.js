// Project content in display order. A classic script also works with file:// previews.
const studioProjects = [
    {
        "name": "vHuman, Year Five",
        "year": 2026,
        "tagline": "The only thing that\u2019s changed is everything.",
        "images": [
            { "src": "images/projects/year-five/gallery/1.jpg", "alt": "vHuman Studios, Year Five — preview 1" },
            { "src": "images/projects/year-five/gallery/2.jpg", "alt": "vHuman Studios, Year Five — preview 2" },
            { "src": "images/projects/year-five/gallery/3.jpg", "alt": "vHuman Studios, Year Five — preview 3" },
            { "src": "images/projects/year-five/gallery/4.jpg", "alt": "vHuman Studios, Year Five — preview 4" },
            { "src": "images/projects/year-five/gallery/5.jpg", "alt": "vHuman Studios, Year Five — preview 5" }
        ],
        "description": [
            "Five years into vHuman Studios, we rebuilt our website to reflect the studio today. Typography, space, and deliberate interaction give the work room to speak.",
            "Moving from Next.js to Astro, we chose a static approach built around HTML, CSS, and lightweight JavaScript. The aim was a faster site, a clearer codebase, and less to maintain\u2014a reminder that thoughtful technology can still be simple."
        ]
    },
    {
        "name": "Studio Kit 26",
        "year": 2026,
        "tagline": "A little space for everything.",
        "image": null,
        "description": [
            "Online real time testing",
        ]
    },
    {
        "name": "Reality Check",
        "year": 2026,
        "tagline": "Spatial, computed.",
        "description": [
            "Reality Check is a diagnostic tool for understanding how 3D assets are likely to perform before they reach an AR experience. It analyzes USDZ models for factors such as geometry, materials, textures, object count, and file size, helping surface the parts of a scene most likely to create performance problems.",
            "The system extracts measurable features from each asset and uses Python and scikit-learn to look for patterns between model complexity and observed performance. Rather than reducing everything to a single file-size limit, Reality Check considers multiple characteristics together to estimate whether an asset is likely to run comfortably or approach the limits of a device.",
            "The goal is to make optimization less dependent on trial and error. By identifying likely bottlenecks and suggesting where attention is needed, Reality Check gives designers and developers a clearer way to prepare 3D content for mobile and spatial computing."
        ]
    },
    {
        "name": "Kobachi",
        "year": 2026,
        "tagline": "A little space for everything.",
        "image": null,
        "description": [
            "Kobachi brings projects, links, media, personal details, and everyday tools into one flexible digital space. Its modular cards let people shape a profile or dashboard around what they want to share and keep close, from a body of work to the small things they use every day.",
            "We chose cards to give different kinds of content their own space. A project, a photograph, and an interactive tool can each take a different form while still feeling part of the same page.",
            "Built with Angular and Spring Boot, the system lets content and layouts evolve without rebuilding the interface. The idea is simple: enough structure to keep things clear, and enough freedom to make the space personal."
        ]
    },
    {
        "name": "Iris",
        "year": 2025,
        "tagline": "Look. That\u2019s enough.",
        "image": null,
        "description": [
            "Iris explores what might come after the keyboard, mouse, and touchscreen. We chose a digital reader as a starting point: a familiar space to explore how looking could become a way of interacting.",
            "Eye control offers another option when speaking is inconvenient or hands are occupied. It may also open up ways to use software for people who find conventional controls difficult. Gaze doesn\u2019t depend on a spoken language, though making it work reliably for different people remains part of the challenge.",
            "Built with React and eye-tracking software developed at Brown University, Iris turns a standard laptop webcam into a way to open books and move through pages using gaze. The aim is to explore how technology might respond to where our attention already is."
        ]
    },
    {
        "name": "Agro AI",
        "year": 2025,
        "tagline": "Corn-fed intelligence.",
        "image": null,
        "description": [
            "Agro AI explores how image recognition can help with the repetitive work of identifying and labeling corn imagery. The model suggests a classification, while people review the results and correct what it gets wrong.",
            "We chose an active-learning approach so those corrections could inform future training. Instead of treating a prediction as the final answer, the project makes review part of the process.",
            "Built with TensorFlow and an active-learning workflow, Agro AI explores how computer vision can reduce repetitive work while keeping human judgment part of the process."
        ]
    },
    {
        "name": "Sesame",
        "year": 2025,
        "tagline": "No magic words required.",
        "image": null,
        "description": [
            "Sesame is a redesign of a user management application built for a large enterprise environment, covering registration, sign-in, password changes, and protected access. These everyday interactions form a small but essential part of a much larger system.",
            "The interface is intentionally restrained. Familiar patterns, clear hierarchy, and predictable behavior keep routine tasks easy to understand as the surrounding system grows more complex.",
            "Built with Java and Jakarta EE, Sesame prioritizes maintainability and straightforward operation. The goal was to make account management clearer and easier to use, with each design decision serving that purpose."
        ]
    },
    {
        "name": "Shokado",
        "year": 2024,
        "tagline": "Like a lunch box.",
        "description": [
            "Shokado is a structured personal profile system for bringing projects, links, and personal information into one compact digital space. Each piece of content is given a defined place, making larger amounts of information easier to scan without losing a sense of order.",
            "Built with Angular and TypeScript, the interface uses reusable components and CSS Grid to keep the layout consistent while allowing profile content to change independently. Profile data can be driven through JSON, with a Spring Boot REST API and H2 providing a path toward persistent data, analytics, and more dynamic profiles.",
            "Shokado established the core system that later grew into Kobachi: a way to organize different kinds of content through a shared visual and technical structure."
        ]
    },
    {
        "name": "Simulator 24",
        "year": 2024,
        "tagline": "Race the data.",
        "image": null,
        "description": [
            "Simulator 24 is a motorsport strategy simulator built around real drivers and their past race data. Driver performance, fuel use, tire wear, and pit decisions come together in a changing race model, where a decision made on one lap can shape what happens several laps later.",
            "Originally built to simulate NASCAR races, the system was later adapted for Formula 1 and other racing formats. Configurable race rules and reusable driver and vehicle profiles let the simulation accommodate different series, using historical performance as the starting point.",
            "A live dashboard follows the race as it unfolds. Its subtle wraparound perspective angles information toward the viewer, giving the interface the feeling of a curved, spatial display.",
            "Python handles the race logic and changing conditions, while a REST API keeps the simulation and dashboard synchronized. Docker provides a consistent environment for testing and deployment. The focus is on what happens behind the driving: reading the conditions, weighing a pit stop, and finding an advantage in the data."
        ]
    },
    {
        "name": "Raider",
        "year": 2024,
        "description": [
            "The Raider brought together the workflow we had been refining across the aircraft program and pushed it into a more mature production process.",
            "By this point, optimization had become less about manually reducing weight and more about building a disciplined pipeline around geometry, materials, textures, hierarchy, export, and real-time performance. The Raider used that process to create a cleaner, lighter, and more portable asset without losing the form and detail that made the original model work.",
            "It represents the most developed version of our approach so far: preparing high-fidelity 3D assets to move more reliably across rendering, AR, VR, and interactive software."
        ]
    },
    {
        "name": "Spirit",
        "year": 2023,
        "description": [
            "The Spirit presented a different problem: a large, continuous form where subtle changes in surface, lighting, and silhouette carry most of the visual character.",
            "We focused on cleaner topology, more efficient texture use, and physically consistent materials, while introducing a more automated audit process for checking geometry and asset weight before export. The project helped move our workflow from manual optimization toward a more repeatable technical pipeline."
        ]
    },
    {
        "name": "Raptor",
        "year": 2023,
        "description": [
            "With the Raptor, the focus shifted toward efficiency without losing surface detail. We improved the way materials and textures were consolidated, reduced draw-heavy complexity, and refined our level-of-detail workflow for different viewing distances.",
            "The result was a lighter asset that could scale more comfortably across desktop, mobile, and immersive experiences."
        ]
    },
    {
        "name": "Tomcat",
        "year": 2023,
        "description": [
            "The Tomcat pushed our optimization workflow toward more complex mechanical geometry. Variable-sweep wings, layered components, and moving surfaces gave us a chance to improve how articulated models were organized and prepared for real-time use.",
            "We refined the asset structure, reduced unnecessary geometry, and made the model easier to animate and move between rendering, AR, and interactive environments."
        ]
    },
    {
        "name": "Studio Kit",
        "year": 2022,
        "tagline": "Tailored.",
        "description": [
            "Studio Kit is a growing collection of plugins, scripts, and small utilities built around the way we work. After spending enough time in tools like Blender, VS Code, and Obsidian, we began noticing the same small frictions: repetitive steps, missing information, and workflows that almost fit, but not quite.",
            "Instead of working around them, we started building our own solutions. What began as our first practical step into programming grew into internal tools for inspecting 3D models, extending creative software, previewing information, and automating repetitive parts of the studio workflow.",
            "None of the tools are particularly large on their own. That is partly the point. Studio Kit is about using code at the scale of the problem, whether that means a short script, a plugin, or a purpose-built utility that makes the software we already use work a little more like we do."
        ]
    },
    {
        "name": "Lightning II",
        "year": 2022,
        "description": [
            "Following the work on Rocky, vHuman Studios was brought into a new 3D aircraft project for a government security client. The starting point was a high-detail F-35 Lightning II model; our role was to prepare it for use beyond traditional rendering and push the technical workflow further than we had before.",
            "We rebuilt and optimized the asset around real-time use, refining geometry, materials, textures, and scene structure while preserving the detail and character of the original model. The pipeline was designed to make the aircraft easier to move between visualization, AR, VR, and other interactive environments without maintaining a separate version for every destination.",
            "The project also gave us room to improve the methods established with Rocky: more deliberate asset organization, tighter control over complexity, better real-time performance, and a cleaner handoff between 3D production and software-driven experiences.",
            "Alongside the technical work, we produced a series of rendered studies exploring the aircraft through lighting, material, and composition. What began with Rocky as an experiment in making 3D assets more versatile had developed into a repeatable production workflow."
        ]
    },
    {
        "name": "Rocky",
        "year": 2022,
        "description": [
            "Rocky was the first project developed under vHuman Studios: a detailed 3D recreation of the Red Bull RB18, created in collaboration with a 3D artist and then rebuilt for use beyond a single render.",
            "Our role was to put the technology behind the model. Geometry, materials, textures, and scene structure were optimized for real-time use, with the asset prepared to move more reliably between rendering, AR, VR, and other interactive workflows. The goal was to preserve as much visual detail as possible while reducing the weight and complexity that make high-fidelity 3D assets difficult to use outside traditional rendering.",
            "We also explored the model as a visual object, producing a series of rendered studies alongside the technical work.",
            "Rocky established an approach that would continue through later vHuman projects: treating a 3D asset not simply as something to look at, but as something that has to perform across software, hardware, and different ways of experiencing it."
        ]
    }
];
