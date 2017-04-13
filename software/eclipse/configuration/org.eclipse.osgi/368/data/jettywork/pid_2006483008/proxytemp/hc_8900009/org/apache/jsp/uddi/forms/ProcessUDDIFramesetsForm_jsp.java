package org.apache.jsp.uddi.forms;

import javax.servlet.*;
import javax.servlet.http.*;
import javax.servlet.jsp.*;
import org.eclipse.wst.ws.internal.explorer.platform.uddi.perspective.*;
import org.eclipse.wst.ws.internal.explorer.platform.uddi.constants.*;
import org.eclipse.wst.ws.internal.explorer.platform.constants.*;

public final class ProcessUDDIFramesetsForm_jsp extends org.apache.jasper.runtime.HttpJspBase
    implements org.apache.jasper.runtime.JspSourceDependent {

  private static final JspFactory _jspxFactory = JspFactory.getDefaultFactory();

  private static java.util.List<String> _jspx_dependants;

  private org.glassfish.jsp.api.ResourceInjector _jspx_resourceInjector;

  public java.util.List<String> getDependants() {
    return _jspx_dependants;
  }

  public void _jspService(HttpServletRequest request, HttpServletResponse response)
        throws java.io.IOException, ServletException {

    PageContext pageContext = null;
    HttpSession session = null;
    ServletContext application = null;
    ServletConfig config = null;
    JspWriter out = null;
    Object page = this;
    JspWriter _jspx_out = null;
    PageContext _jspx_page_context = null;

    try {
      response.setContentType("text/html; charset=UTF-8");
      pageContext = _jspxFactory.getPageContext(this, request, response,
      			null, true, 8192, true);
      _jspx_page_context = pageContext;
      application = pageContext.getServletContext();
      config = pageContext.getServletConfig();
      session = pageContext.getSession();
      out = pageContext.getOut();
      _jspx_out = out;
      _jspx_resourceInjector = (org.glassfish.jsp.api.ResourceInjector) application.getAttribute("com.sun.appserv.jsp.resource.injector");


/*******************************************************************************
 * Copyright (c) 2001, 2004 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 * 
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

      out.write("\n");
      out.write("\n");
      out.write("\n");
      org.eclipse.wst.ws.internal.explorer.platform.perspective.Controller controller = null;
      synchronized (session) {
        controller = (org.eclipse.wst.ws.internal.explorer.platform.perspective.Controller) _jspx_page_context.getAttribute("controller", PageContext.SESSION_SCOPE);
        if (controller == null){
          controller = new org.eclipse.wst.ws.internal.explorer.platform.perspective.Controller();
          _jspx_page_context.setAttribute("controller", controller, PageContext.SESSION_SCOPE);
        }
      }
      out.write('\n');

   UDDIPerspective uddiPerspective = controller.getUDDIPerspective();

      out.write("   \n");
      java.lang.StringBuffer formAction = null;
      synchronized (request) {
        formAction = (java.lang.StringBuffer) _jspx_page_context.getAttribute("formAction", PageContext.REQUEST_SCOPE);
        if (formAction == null){
          formAction = new java.lang.StringBuffer();
          _jspx_page_context.setAttribute("formAction", formAction, PageContext.REQUEST_SCOPE);
        }
      }
      out.write('\n');
      java.lang.StringBuffer formFrameName = null;
      synchronized (request) {
        formFrameName = (java.lang.StringBuffer) _jspx_page_context.getAttribute("formFrameName", PageContext.REQUEST_SCOPE);
        if (formFrameName == null){
          formFrameName = new java.lang.StringBuffer();
          _jspx_page_context.setAttribute("formFrameName", formFrameName, PageContext.REQUEST_SCOPE);
        }
      }
      out.write("\n");
      out.write("<form action=\"");
      out.print(response.encodeURL(controller.getPathWithContext(formAction.toString())));
      out.write("\" method=\"post\" target=\"");
      out.print(FrameNames.PERSPECTIVE_WORKAREA);
      out.write("\" enctype=\"multipart/form-data\" style=\"margin-top:0;margin-bottom:0\">\n");
      out.write("  <input name=\"");
      out.print(ActionInputs.FRAME_NAME);
      out.write("\" type=\"hidden\" value=\"");
      out.print(formFrameName);
      out.write("\">\n");
      out.write("  <input name=\"");
      out.print(UDDIActionInputs.FRAMESET_COLS_PERSPECTIVE_CONTENT);
      out.write("\" type=\"hidden\" value=\"");
      out.print(uddiPerspective.getPerspectiveContentFramesetCols());
      out.write("\">\n");
      out.write("  <input name=\"");
      out.print(UDDIActionInputs.FRAMESET_ROWS_ACTIONS_CONTAINER);
      out.write("\" type=\"hidden\" value=\"");
      out.print(uddiPerspective.getActionsContainerFramesetRows());
      out.write("\">\n");
      out.write("</form>\n");
    } catch (Throwable t) {
      if (!(t instanceof SkipPageException)){
        out = _jspx_out;
        if (out != null && out.getBufferSize() != 0)
          out.clearBuffer();
        if (_jspx_page_context != null) _jspx_page_context.handlePageException(t);
        else throw new ServletException(t);
      }
    } finally {
      _jspxFactory.releasePageContext(_jspx_page_context);
    }
  }
}
