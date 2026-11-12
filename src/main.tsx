import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {Accordion} from './components/Accordion'
import {Carousel} from './components/Carousel'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-4 w-xl">
      <Accordion type="single">
        <Accordion.Item className="border-t border-white">
          <Accordion.Trigger className="cursor-pointer w-full text-start py-1">Label</Accordion.Trigger>
          <Accordion.Panel className="pb-4">
            <p>Content</p>
            <button>test</button>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item className="border-t border-white">
          <Accordion.Trigger className="cursor-pointer w-full text-start py-1">Label</Accordion.Trigger>
          <Accordion.Panel className="pb-4">
            <p>Content</p>
            <button>test</button>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
    <div className="p-4 w-full">
      <Carousel type="infinite" autoPlay={{ speed: 0.5, playPauseEasingDuration: 2000, releaseEasingDuration:3000, pauseOnHover:false, pauseOnFocus:false, }} gap={16} duration={400} drag={{ momentum: true, friction: 1.0 }} aria-label="Featured">
          <Carousel.Track className="w-full max-w-3xl">
              <Carousel.Slide className="w-64"><button>One</button></Carousel.Slide>
              <Carousel.Slide className="w-64"><button>Two</button></Carousel.Slide>
              <Carousel.Slide className="w-64"><button>Three</button></Carousel.Slide>
          </Carousel.Track>
          <Carousel.Prev>←</Carousel.Prev>
          <Carousel.Next>→</Carousel.Next>
      </Carousel>
    </div>

  </StrictMode>,
)
