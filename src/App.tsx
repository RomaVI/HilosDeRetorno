import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import logo from './assets/logo13.jpg'
import Home from './pages/home'
import { LayerMarkersDemo } from '@/components/ui/mapcn-layer-markers'

function AppContent() {
  const [, setIsHeaderHidden] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => {
      setIsHeaderHidden(window.scrollY > 0)
    }

    const handleWheel = (event: WheelEvent) => {
      if (!['/', '/home', '/1', '/2', '/3'].includes(location.pathname)) return

      event.preventDefault()

      const currentPage = Number(location.pathname.replace(/^\//, '')) || 1
      const currentPageNumber = Number.isNaN(currentPage) ? 1 : currentPage
      const nextPage = event.deltaY > 0
        ? Math.min(currentPageNumber + 1, 3)
        : Math.max(currentPageNumber - 1, 1)

      navigate(`/${nextPage}`)
    }

    window.addEventListener('scroll', handleScroll)
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [location.pathname, navigate])

  return (
    <>
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
            <img src="https://img.icons8.com/?size=100&id=v2LNL7ofGkrB&format=png&color=000000" width="30vh" height="30vh" alt="Icono de inicio"></img>
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
        <Route path='/' element={<Navigate to='/1' replace />} />
        <Route path='/home' element={<Navigate to='/1' replace />} />
        <Route path='/1' element={<Home page={1} />} />
        <Route path='/2' element={<Home page={2} />} />
        <Route path='/3' element={<Home page={3} />} />
        <Route path='/map' element={<LayerMarkersDemo />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>


  )
}

export default App
