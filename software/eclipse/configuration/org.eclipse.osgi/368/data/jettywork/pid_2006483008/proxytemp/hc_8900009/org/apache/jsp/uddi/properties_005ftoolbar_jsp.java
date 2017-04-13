package org.apache.jsp.uddi;

import javax.servlet.*;
import javax.servlet.http.*;
import javax.servlet.jsp.*;
import org.eclipse.wst.ws.internal.explorer.platform.uddi.perspective.*;
import org.eclipse.wst.ws.internal.explorer.platform.uddi.constants.*;
import org.eclipse.wst.ws.internal.explorer.platform.perspective.*;
import org.eclipse.wst.ws.internal.explorer.platform.constants.*;

public final class properties_005ftoolbar_jsp extends org.apache.jasper.runtime.HttpJspBase
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
      out.write("<!DOCTYPE html PUBLIC \"-//W3C//DTD HTML 3.2 Final//EN\">\n");
      out.write("<html lang=\"");
      out.print(response.getLocale().getLanguage());
      out.write("\">\n");
      out.write("<head>\n");
      out.write("  <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n");
      out.write("  <title>");
      out.print(uddiPerspective.getMessage("FRAME_TITLE_PROPERTIES_TOOLBAR"));
      out.write("</title>\n");
      out.write("  <link rel=\"stylesheet\" type=\"text/css\" href=\"");
      out.print(response.encodeURL(controller.getPathWithContext("css/toolbar.css")));
      out.write("\">\n");
      org.apache.jasper.runtime.JspRuntimeLibrary.include(request, response, "/uddi/scripts/uddiframesets.jsp", out, true);
      out.write("\n");
      out.write("<script language=\"javascript\" src=\"");
      out.print(response.encodeURL(controller.getPathWithContext("scripts/toolbar.js")));
      out.write("\">\n");
      out.write("</script>\n");
      out.write("</head>\n");
      out.write("<body dir=\"");
      out.print(org.eclipse.wst.ws.internal.explorer.platform.util.DirUtils.getDir());
      out.write("\" class=\"toolbarbodymargin\">\n");
      out.write("<div id=\"toolbarborder\">\n");
      out.write("  <div id=\"toolbar\" ondblclick=\"processFramesetSizes(document.forms[0])\">\n");
      java.lang.StringBuffer formAction = null;
      synchronized (request) {
        formAction = (java.lang.StringBuffer) _jspx_page_context.getAttribute("formAction", PageContext.REQUEST_SCOPE);
        if (formAction == null){
          formAction = new java.lang.StringBuffer();
          _jspx_page_context.setAttribute("formAction", formAction, PageContext.REQUEST_SCOPE);
          out.write('\n');

  formAction.append("uddi/actions/ResizeUDDIFramesActionJSP.jsp");

          out.write("  \n");
        }
      }
      out.write('\n');
      java.lang.StringBuffer formFrameName = null;
      synchronized (request) {
        formFrameName = (java.lang.StringBuffer) _jspx_page_context.getAttribute("formFrameName", PageContext.REQUEST_SCOPE);
        if (formFrameName == null){
          formFrameName = new java.lang.StringBuffer();
          _jspx_page_context.setAttribute("formFrameName", formFrameName, PageContext.REQUEST_SCOPE);
          out.write('\n');

   formFrameName.append(UDDIFrameNames.PROPERTIES_CONTAINER);

          out.write('\n');
        }
      }
      out.write('\n');
      org.apache.jasper.runtime.JspRuntimeLibrary.include(request, response, "/uddi/forms/ProcessUDDIFramesetsForm.jsp", out, true);
      out.write("\n");
      out.write("    <table width=\"100%\" height=25 cellpadding=0 cellspacing=0 border=0>\n");
      out.write("      <tr>\n");
      out.write("        <td valign=\"middle\" align=\"center\" width=25 height=25><img class=\"normal\" src=\"");
      out.print(response.encodeURL(controller.getPathWithContext("images/actions.gif")));
      out.write("\" alt=\"\" width=16 height=16></td>\n");

   String doubleClickColumnTitle = null;
   if (uddiPerspective.getPerspectiveContentFramesetCols().endsWith("100%"))
   {
     if (uddiPerspective.getActionsContainerFramesetRows().startsWith("100%"))
       doubleClickColumnTitle = controller.getMessage("ALT_DOUBLE_CLICK_TO_RESTORE");
   }
   if (doubleClickColumnTitle == null)
     doubleClickColumnTitle = controller.getMessage("ALT_DOUBLE_CLICK_TO_MAXIMIZE");

      out.write("        \n");
      out.write("        <td id=\"doubleclickcolumn\" title=\"");
      out.print(doubleClickColumnTitle);
      out.write("\" valign=\"middle\" width=\"*\" height=25 nowrap class=\"text\">");
      out.print(controller.getMessage("ALT_ACTIONS"));
      out.write("</td>\n");

   NodeManager navigatorManager = uddiPerspective.getNavigatorManager();
   Node selectedNavigatorNode = navigatorManager.getSelectedNode();
   if (selectedNavigatorNode != null)
   {
     ToolManager toolManager;
     if (selectedNavigatorNode.getViewId() == ActionInputs.VIEWID_DEFAULT)
       toolManager = selectedNavigatorNode.getToolManager();
     else
       toolManager = selectedNavigatorNode.getViewToolManager();
     for (int i=0;i<toolManager.getNumberOfTools();i++)
     {
       Tool tool = (Tool)toolManager.getTool(i);

      out.write("\n");
      out.write("        <td valign=\"middle\" align=\"center\" width=25 height=25>");
      out.print(tool.renderTool(response,controller));
      out.write("</td>\n");

     }
   }

      out.write("\n");
      out.write("      </tr>\n");
      out.write("    </table>\n");
      out.write("  </div>\n");
      out.write("</div>\n");
      out.write("</body>\n");
      out.write("</html>\n");
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
