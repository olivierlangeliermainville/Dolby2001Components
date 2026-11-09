import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {Accordion} from './components/Accordion'

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
  </StrictMode>,
)
