import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import logo from './assets/logo13.jpg'
import placa from './assets/placa1.png'
import { LayerMarkersDemo } from '@/components/ui/mapcn-layer-markers'

function App() {
  const [isHeaderHidden, setIsHeaderHidden] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsHeaderHidden(window.scrollY > 0)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <BrowserRouter>
      <section id='header' className={isHeaderHidden ? 'hidden' : ''}>
        <h3>INDUSTRIA ARGENTINA - 100% PLÁSTICO RECICLADO</h3>
      </section>
      <section id="nav">
        <div className='logo'>
          <div className='imgLogo'>
            <img src={logo} alt="Logo" />
          </div>
        </div>
        <div className='txtLogo'>
          <h1>Hilos del Retorno</h1>
        </div>
        <div className='icons'>

          <div className='iconItem'>
            <img src="https://img.icons8.com/?size=100&id=59778&format=png&color=000000" alt="Icono de inicio"></img>
          </div>
          <div className='iconItem'>
            <img src="https://img.icons8.com/?size=100&id=v2LNL7ofGkrB&format=png&color=000000" width="30vh" height="30vh"  alt="Icono de inicio"></img>
          </div>
          <div className='iconItem'>
            <img src="https://img.icons8.com/?size=100&id=61845&format=png&color=000000" alt="Icono de inicio"></img>
          </div>
          <div className='iconItem enditem'>
            <img src="https://img.icons8.com/?size=100&id=4FCpkShJnmAa&format=png&color=000000" alt="Icono de inicio"></img>
          </div>
        </div>
      </section>

      <Routes>
        <Route
          path='/'
          element={
            <main>
              <section id='block'>
                <div className='block1 struct'>
                  <div className='block-struct'>
                    <div className='txtBlock1'>
                      <h4>Aislante Termico y Placas a Partir de Textiles Reciclados.</h4>
                      <p>Inovacion sostenible para la construccion y la industria.  Soluciones eficaces, ecologicas y de alta calidad</p>
                    </div>
                    <div className='imgBlock1'>
                      <img src={placa} alt="Placa Textil" />
                    </div>
                  </div>
                </div>
                <div className='block2 struct'>
                  <p>Nuestros Productos</p>
                  <div className='block2Struct'></div>
                </div>
                <div className='block3 struct'></div>
              </section>
            </main>
          }
        />
        <Route path='/map' element={<LayerMarkersDemo />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
